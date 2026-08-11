import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const blogDir = resolve(scriptDir, '..');
const publicDir = join(blogDir, 'docs/src/public');
const imageDir = join(publicDir, 'imgs/aizaibingchuan');
const sharedDir = join(imageDir, 'shared');
const articleDir = join(blogDir, 'docs/src/reviews/aizaibingchuan');
const reportPath = join(articleDir, 'reports/image-dedup-report.md');
const publicUrlPrefix = '/imgs/aizaibingchuan/';
const apply = process.argv.includes('--apply');

const walk = async (dir, predicate = () => true) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) return walk(entryPath, predicate);
    return predicate(entryPath) ? [entryPath] : [];
  }));
  return paths.flat();
};

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
};

const hashFile = (file) => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256');
  createReadStream(file)
    .on('error', reject)
    .on('data', (chunk) => hash.update(chunk))
    .on('end', () => resolveHash(hash.digest('hex')));
});

const toPublicUrl = (file) => `${publicUrlPrefix}${relative(imageDir, file).replaceAll('\\', '/')}`;

const toImageFile = (url) => {
  const path = url.replace(/^\/blog-frame\//, '').replace(/^\//, '');
  return join(publicDir, path);
};

const imageUrlPattern = /(?:\/blog-frame)?\/imgs\/aizaibingchuan\/[\w./-]+\.(?:avif|gif|jpe?g|png|webp)/gi;

const readReferences = async (markdownFiles) => {
  const references = new Map();
  const contents = new Map();
  await mapLimit(markdownFiles, 16, async (file) => {
    const content = await readFile(file, 'utf8');
    contents.set(file, content);
    for (const url of content.match(imageUrlPattern) || []) {
      const imageFile = toImageFile(url);
      const files = references.get(imageFile) || new Set();
      files.add(file);
      references.set(imageFile, files);
    }
  });
  return { references, contents };
};

const byteSize = async (files) => {
  const sizes = await Promise.all(files.map(async (file) => (await stat(file)).size));
  return sizes.reduce((sum, size) => sum + size, 0);
};

const formatBytes = (size) => `${(size / 1024 / 1024).toFixed(1)} MiB`;

const main = async () => {
  const imageFiles = await walk(imageDir, (file) => !file.startsWith(`${sharedDir}/`));
  const markdownFiles = await walk(articleDir, (file) => file.endsWith('.md'));
  const { references, contents } = await readReferences(markdownFiles);
  const hashes = await mapLimit(imageFiles, 12, async (file) => ({ file, hash: await hashFile(file) }));
  const groups = new Map();

  for (const entry of hashes) {
    const files = groups.get(entry.hash) || [];
    files.push(entry.file);
    groups.set(entry.hash, files);
  }

  const duplicateGroups = [];
  for (const [hash, files] of groups) {
    if (files.length < 2 || !files.some((file) => references.has(file))) continue;
    const orderedFiles = [...files].sort();
    const canonical = orderedFiles[0];
    const extension = extname(canonical).toLowerCase();
    const destination = join(sharedDir, `${hash}${extension}`);
    duplicateGroups.push({ hash, files: orderedFiles, canonical, destination });
  }

  const replacementUrls = new Map();
  for (const group of duplicateGroups) {
    const destinationUrl = toPublicUrl(group.destination);
    for (const file of group.files) {
      const sourceUrl = toPublicUrl(file);
      replacementUrls.set(sourceUrl, destinationUrl);
      replacementUrls.set(`/blog-frame${sourceUrl}`, destinationUrl);
    }
  }

  const reclaimedBytes = await byteSize(duplicateGroups.flatMap((group) => group.files.slice(1)));

  let rewrittenFiles = 0;
  if (apply) {
    await mkdir(sharedDir, { recursive: true });
    for (const group of duplicateGroups) {
      try {
        await stat(group.destination);
      } catch {
        await cp(group.canonical, group.destination);
      }
    }

    for (const [file, content] of contents) {
      let nextContent = content;
      for (const [sourceUrl, destinationUrl] of replacementUrls) {
        nextContent = nextContent.replaceAll(sourceUrl, destinationUrl);
      }
      if (nextContent !== content) {
        await writeFile(file, nextContent);
        rewrittenFiles++;
      }
    }

    const verifiedReferences = await readReferences(markdownFiles);
    const remainingFiles = duplicateGroups.flatMap((group) => group.files)
      .filter((file) => verifiedReferences.references.has(file));
    if (remainingFiles.length) {
      throw new Error(`Refusing to delete ${remainingFiles.length} image paths that are still referenced.`);
    }

    for (const group of duplicateGroups) {
      await Promise.all(group.files.map((file) => rm(file)));
    }
  }

  const removedFiles = duplicateGroups.reduce((count, group) => count + group.files.length, 0);
  const report = [
    '# 爱在冰川图片去重报告',
    '',
    `- 模式：${apply ? '已执行迁移' : '仅分析'}`,
    `- 扫描图片：${imageFiles.length}`,
    `- 扫描文章：${markdownFiles.length}`,
    `- 可合并图片组：${duplicateGroups.length}`,
    `- ${apply ? '已迁移' : '可迁移'}原图片：${removedFiles}`,
    `- ${apply ? '已释放' : '预计释放'}空间：${formatBytes(reclaimedBytes)}`,
    `- 改写文章：${rewrittenFiles}`,
    '',
    '公共图片位于 `docs/src/public/imgs/aizaibingchuan/shared/`，文件名为原始内容的 SHA-256。',
  ].join('\n');
  await writeFile(reportPath, `${report}\n`);

  console.log(report);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
