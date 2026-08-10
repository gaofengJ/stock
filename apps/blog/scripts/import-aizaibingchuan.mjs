#!/usr/bin/env node
/**
 * Import public 爱在冰川 WeChat articles listed in a JSONL export.
 *
 * The importer is deliberately dependency-light: it fetches the public article
 * pages itself, keeps a resumable cache, localizes only body images, and writes
 * VitePress Markdown in the same shape as the existing review pages.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const blogRoot = path.resolve(scriptDir, '..');
const reviewRoot = path.join(blogRoot, 'docs/src/reviews/aizaibingchuan');
const imageRoot = path.join(blogRoot, 'docs/src/public/imgs/aizaibingchuan');
const reportRoot = path.join(reviewRoot, 'reports');
const cacheRoot = path.join(blogRoot, '.cache/aizaibingchuan');
const cachePath = path.join(cacheRoot, 'import-state.json');
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 MicroMessenger/8.0.40';
let stateWrite = Promise.resolve();

const args = process.argv.slice(2).filter((value) => value !== '--');
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const inputPath = option('--input');
const refresh = args.includes('--refresh');
const dryRun = args.includes('--dry-run');
const reconcileLegacy = args.includes('--reconcile-legacy');
const limit = Number(option('--limit', '0'));
const concurrency = Math.max(1, Math.min(4, Number(option('--concurrency', '2'))));
const delayMs = Math.max(0, Number(option('--delay-ms', '250')));

if (!inputPath && !reconcileLegacy) throw new Error('Usage: pnpm run import:aizaibingchuan -- --input <links.jsonl> [--refresh]');
if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a non-negative integer.');
if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('--concurrency must be a positive integer.');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const escapeYaml = (value) => JSON.stringify(String(value));
const decodeEntities = (value) => value
  .replace(/&(?:#x([\da-f]+)|#(\d+)|quot|apos|amp|lt|gt|nbsp);/gi, (match, hex, decimal) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    return ({ '&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' })[match.toLowerCase()] || match;
  });
const normalizeUrl = (value) => decodeEntities(String(value || '').trim()).replace(/^http:/, 'https:').replace(/#.*$/, '');
const hash = (value) => createHash('sha256').update(value).digest('hex');

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function fetchWithRetry(url, type = 'article') {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), type === 'image' ? 45_000 : 60_000);
      const response = await fetch(url, {
        headers: { 'user-agent': userAgent, accept: type === 'image' ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' : 'text/html,application/xhtml+xml' },
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 2) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

function attributes(token) {
  const result = {};
  for (const match of token.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return result;
}

function findBalancedElement(source, id) {
  const start = new RegExp(`<div\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i').exec(source);
  if (!start) throw new Error(`Could not find #${id}.`);
  const tokens = /<\/?div\b[^>]*>/gi;
  tokens.lastIndex = start.index;
  let depth = 0;
  let match;
  while ((match = tokens.exec(source))) {
    depth += match[0][1] === '/' ? -1 : 1;
    if (depth === 0) return source.slice(start.index, tokens.lastIndex);
  }
  throw new Error(`Could not balance #${id}.`);
}

function parseHtml(source) {
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  const voidTags = new Set(['br', 'img', 'hr', 'meta', 'input', 'source', 'wbr']);
  const pattern = /<!--[\s\S]*?-->|<[^>]+>/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > cursor) stack.at(-1).children.push({ text: decodeEntities(source.slice(cursor, match.index)) });
    cursor = pattern.lastIndex;
    const token = match[0];
    if (token.startsWith('<!--') || /^<![^-]/.test(token)) continue;
    const closing = /^<\//.test(token);
    const tagMatch = /^<\/?\s*([\w:-]+)/.exec(token);
    if (!tagMatch) continue;
    const tag = tagMatch[1].toLowerCase();
    if (closing) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) {
          stack.length = index;
          break;
        }
      }
      continue;
    }
    const node = { tag, attrs: attributes(token), children: [] };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !/\/>$/.test(token)) stack.push(node);
  }
  if (cursor < source.length) stack.at(-1).children.push({ text: decodeEntities(source.slice(cursor)) });
  return root;
}

function textContent(node) {
  if ('text' in node) return node.text;
  return node.children.map(textContent).join('');
}

function cleanMarkdown(value) {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');
}

function markdownFromTree(root, imagePaths) {
  const render = (node) => {
    if ('text' in node) return node.text.replace(/\u200b/g, '');
    const tag = node.tag;
    if (['script', 'style', 'noscript', 'iframe', 'mp-common-profile', 'mp-style-type'].includes(tag)) return '';
    const inner = node.children.map(render).join('');
    if (tag === 'root' || ['span', 'font', 'small', 'big', 'sup', 'sub'].includes(tag)) return inner;
    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'img') {
      const source = normalizeUrl(node.attrs['data-src'] || node.attrs.src);
      const alt = (node.attrs.alt || '图片').replace(/[\[\]]/g, '');
      return source ? `\n\n![${alt}](${imagePaths.get(source) || source})\n\n` : '';
    }
    if (tag === 'a') {
      const href = normalizeUrl(node.attrs.href);
      const label = cleanMarkdown(inner);
      if (!href) return inner;
      return label ? `[${label}](${href})` : `<${href}>`;
    }
    if (tag === 'strong' || tag === 'b') return inner.trim() ? `**${inner.trim()}**` : '';
    if (tag === 'em' || tag === 'i') return inner.trim() ? `*${inner.trim()}*` : '';
    if (tag === 'u') {
      const plain = textContent(node).replace(/\s/g, '');
      return plain.length > 10 ? `<strong style="color: #d32f2f">${inner.trim()}</strong>` : inner;
    }
    if (/^h[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Math.min(6, Number(tag[1]) + 1))} ${cleanMarkdown(inner)}\n\n`;
    if (tag === 'li') return `- ${cleanMarkdown(inner)}\n`;
    if (tag === 'blockquote') return `\n\n${cleanMarkdown(inner).split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    if (['p', 'div', 'section', 'article', 'figure', 'figcaption', 'center', 'ul', 'ol', 'table', 'tbody', 'thead', 'tr', 'td', 'th'].includes(tag)) return `\n\n${inner.trim()}\n\n`;
    return inner;
  };
  return cleanMarkdown(render(root));
}

function articleDate(html, record) {
  const value = /var createTime\s*=\s*['"]([^'"]+)/.exec(html)?.[1]
    || /var oriCreateTime\s*=\s*['"]([^'"]+)/.exec(html)?.[1];
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 16);
  if (value && /^\d{10}$/.test(value)) {
    const date = new Date(Number(value) * 1000);
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  return `${record.published_date} 00:00`;
}

function titleFromHtml(html, record) {
  const title = /var msg_title\s*=\s*'([\s\S]*?)'\.html\(false\)/.exec(html)?.[1]
    || /<h1[^>]*id=["']activity-name["'][^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return cleanMarkdown(decodeEntities(title?.replace(/<[^>]*>/g, '') || record.title || '未命名文章'));
}

function canonicalId(record) {
  const url = new URL(record.source_url);
  return `${url.searchParams.get('mid') || hash(record.source_url).slice(0, 12)}-${url.searchParams.get('idx') || '1'}`;
}

function findImageUrls(root) {
  const urls = [];
  const visit = (node) => {
    if ('text' in node) return;
    if (node.tag === 'img') {
      const source = normalizeUrl(node.attrs['data-src'] || node.attrs.src);
      if (source && !urls.includes(source)) urls.push(source);
    }
    node.children.forEach(visit);
  };
  visit(root);
  return urls;
}

async function localizeImages(urls, targetDirectory, publicPrefix) {
  const paths = new Map();
  const failures = [];
  await mkdir(targetDirectory, { recursive: true });
  for (const [index, url] of urls.entries()) {
    try {
      const response = await fetchWithRetry(url, 'image');
      const original = Buffer.from(await response.arrayBuffer());
      if (!original.length) throw new Error('empty image');
      const metadata = await sharp(original, { animated: true, failOn: 'none' }).metadata();
      const originalFormat = metadata.format || (response.headers.get('content-type') || '').split('/')[1] || 'jpg';
      let output = original;
      let suffix = originalFormat === 'jpeg' ? 'jpg' : originalFormat;
      if (['jpeg', 'png', 'jp2'].includes(originalFormat) && !(metadata.pages > 1)) {
        const encoder = originalFormat === 'jpeg' ? { quality: 92, effort: 6 } : { lossless: true, effort: 6 };
        const webp = await sharp(original, { animated: false, failOn: 'none' }).webp(encoder).toBuffer();
        if (webp.length < original.length) {
          output = webp;
          suffix = 'webp';
        }
      }
      const filename = `image-${String(index + 1).padStart(2, '0')}.${suffix.replace(/[^a-z0-9]/gi, '') || 'img'}`;
      await writeFile(path.join(targetDirectory, filename), output);
      paths.set(url, `${publicPrefix}/${filename}`);
    } catch (error) {
      failures.push({ url, error: error.message });
    }
  }
  return { paths, failures };
}

async function listMarkdown(directory) {
  const results = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(target);
      else if (entry.isFile() && entry.name.endsWith('.md')) results.push(target);
    }
  }
  await visit(directory);
  return results;
}

async function existingDocuments() {
  const documents = new Map();
  for (const file of await listMarkdown(reviewRoot)) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/^(?:source_url:\s*["']?|原文链接[：:]\s*(?:<|\[)?)(https?:\/\/[^\s>\])]+)/gmi)) {
      documents.set(normalizeUrl(match[1]), file);
    }
  }
  return documents;
}

function documentBody({ title, publishedAt, sourceUrl, markdown, imageCount }) {
  const order = publishedAt.replace(/[- :]/g, '');
  return `---\ntitle: ${escapeYaml(title)}\norder: ${order}\npublished_at: ${escapeYaml(publishedAt)}\nsource_url: ${escapeYaml(sourceUrl)}\nimage_count: ${imageCount}\n---\n\n# ${title}\n\n作者：**爱在冰川**\n\n发布时间：${publishedAt}\n\n原文链接：<${sourceUrl}>\n\n## 原文内容\n\n${markdown}\n`;
}

async function readState() {
  if (!(await exists(cachePath))) return {};
  try { return JSON.parse(await readFile(cachePath, 'utf8')); } catch { return {}; }
}

async function writeState(state) {
  await mkdir(cacheRoot, { recursive: true });
  const temporary = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, cachePath);
}

function queueStateWrite(state) {
  stateWrite = stateWrite.then(() => writeState(state));
  return stateWrite;
}

function articleTarget(record, publishedAt, existing) {
  if (existing) return existing;
  const [date, time] = publishedAt.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const timeKey = time.replace(':', '');
  return path.join(reviewRoot, String(year), `${year}-${month}-${day}-${timeKey}-${canonicalId(record)}.md`);
}

function frontmatterValue(source, field) {
  const value = new RegExp(`^${field}:\\s*(.*)$`, 'm').exec(source)?.[1]?.trim();
  if (!value) return '';
  try { return JSON.parse(value); } catch { return value.replace(/^['"]|['"]$/g, ''); }
}

function titleDateKey(title) {
  const match = /^(20\d{2})-(\d{1,2})-(\d{1,2})(?:\s|数据|复盘|$)/.exec(title);
  return match ? `${match[1]}/${match[1]}-${Number(match[2])}-${Number(match[3])}` : '';
}

function daysBetween(left, right) {
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  return Math.abs((leftDate - rightDate) / 86_400_000);
}

function normalizeArticleText(source) {
  return source
    .replace(/^---[\s\S]*?---/, '')
    .replace(/^#[\s\S]*?## 原文内容/m, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function bodyMatchScore(candidate, legacy) {
  const start = Math.min(160, Math.floor(candidate.length / 4));
  let score = 0;
  for (let index = start; index + 48 <= candidate.length; index += 90) {
    if (legacy.includes(candidate.slice(index, index + 48))) score += 1;
  }
  return score;
}

async function reconcileLegacyArticles() {
  const files = await listMarkdown(reviewRoot);
  const legacy = new Map();
  const imported = [];
  for (const file of files) {
    if (file.includes(`${path.sep}reports${path.sep}`) || file.includes(`${path.sep}strategies${path.sep}`)) continue;
    const source = await readFile(file, 'utf8');
    const relative = path.relative(reviewRoot, file).split(path.sep).join('/');
    const basename = path.basename(file);
    const sourceUrl = frontmatterValue(source, 'source_url');
    if (/^20\d{2}-\d{1,2}-\d{1,2}\.md$/.test(basename) && !sourceUrl) {
      legacy.set(relative.replace(/\.md$/, ''), file);
      continue;
    }
    const title = frontmatterValue(source, 'title');
    const publishedAt = frontmatterValue(source, 'published_at');
    if (!sourceUrl || !publishedAt) continue;
    imported.push({ file, sourceUrl, title, publishedAt, body: normalizeArticleText(source) });
  }

  const replacements = [];
  const ambiguous = [];
  const usedCandidates = new Set();
  for (const [key, legacyFile] of legacy) {
    const targetDate = key.replace(/^\d{4}\//, '').replace(/-(\d+)-(\d+)$/, (_, month, day) => `-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    const legacyBody = normalizeArticleText(await readFile(legacyFile, 'utf8'));
    const candidates = imported
      .filter((article) => !usedCandidates.has(article.file)
        && article.publishedAt.slice(0, 4) === key.slice(0, 4)
        && daysBetween(targetDate, article.publishedAt.slice(0, 10)) <= 2)
      .map((article) => ({ ...article, score: bodyMatchScore(article.body, legacyBody) }))
      .filter((article) => article.score >= 2)
      .sort((left, right) => right.score - left.score);
    if (!candidates.length) continue;
    if (candidates.length === 1 || candidates[0].score > candidates[1].score) {
      usedCandidates.add(candidates[0].file);
      replacements.push({ key, legacyFile, ...candidates[0] });
    } else {
      ambiguous.push({ key, count: candidates.length, titles: candidates.map((article) => article.title) });
    }
  }

  if (!dryRun) {
    for (const item of replacements) {
      const backup = `${item.legacyFile}.legacy-backup`;
      await rename(item.legacyFile, backup);
      try {
        await rename(item.file, item.legacyFile);
      } catch (error) {
        await rename(backup, item.legacyFile);
        throw error;
      }
      await rm(backup, { force: true });
    }
    await rebuildIndex();
    await mkdir(reportRoot, { recursive: true });
    await writeFile(path.join(reportRoot, 'legacy-reconciliation.md'), [
      '---', 'title: 历史日期文件去重报告', '---', '',
      `- 正文锚点原位替换：${replacements.length}`,
      `- 存在歧义、未处理：${ambiguous.length}`,
      '', '## 原位替换', '',
      ...replacements.map((item) => `- ${item.key}：${item.title}（${item.sourceUrl}）`),
      '', '## 存在歧义、未处理', '',
      ...ambiguous.map((item) => `- ${item.key}：${item.count} 篇候选`), '',
    ].join('\n'));
  }
  return { replacements, ambiguous };
}

async function importOne(record, documents, state) {
  const sourceUrl = normalizeUrl(record.source_url);
  const recordHash = hash(JSON.stringify(record));
  if (!refresh && state[sourceUrl]?.recordHash === recordHash && await exists(state[sourceUrl].file)) return { status: 'skipped', record, reason: 'resumable cache' };
  const response = await fetchWithRetry(sourceUrl);
  const html = await response.text();
  if (/环境异常|完成验证后即可继续访问|去验证/.test(html)) throw new Error('WeChat access verification page returned');
  const tree = parseHtml(findBalancedElement(html, 'js_content'));
  const publishedAt = articleDate(html, record);
  const title = titleFromHtml(html, record);
  const target = articleTarget(record, publishedAt, documents.get(sourceUrl));
  const articleId = canonicalId(record);
  const year = publishedAt.slice(0, 4);
  const imageDirectory = path.join(imageRoot, year, articleId);
  const stagingDirectory = path.join(cacheRoot, 'staging', `${articleId}-${Date.now()}`);
  const publicPrefix = `/imgs/aizaibingchuan/${year}/${articleId}`;
  const imageUrls = findImageUrls(tree);
  const { paths: imagePaths, failures } = await localizeImages(imageUrls, stagingDirectory, publicPrefix);
  const markdown = markdownFromTree(tree, imagePaths);
  if (!markdown) throw new Error('article body became empty');
  const replacement = await exists(target);
  if (!dryRun) {
    await mkdir(path.dirname(target), { recursive: true });
    const body = documentBody({ title, publishedAt, sourceUrl, markdown, imageCount: imagePaths.size });
    await writeFile(`${target}.tmp`, body);
    await rename(`${target}.tmp`, target);
    if (await exists(imageDirectory)) await rm(imageDirectory, { recursive: true, force: true });
    if (imagePaths.size) {
      await mkdir(path.dirname(imageDirectory), { recursive: true });
      await rename(stagingDirectory, imageDirectory);
    } else await rm(stagingDirectory, { recursive: true, force: true });
    documents.set(sourceUrl, target);
    state[sourceUrl] = { recordHash, file: target, importedAt: new Date().toISOString(), imageCount: imagePaths.size };
  } else await rm(stagingDirectory, { recursive: true, force: true });
  return { status: replacement ? 'replaced' : 'added', record, target, title, publishedAt, images: imagePaths.size, failures };
}

async function rebuildIndex() {
  const indexPath = path.join(reviewRoot, 'index.md');
  const original = await readFile(indexPath, 'utf8');
  const prefix = original.split(/\n- \[20\d{2}-/)[0].trimEnd();
  const pages = [];
  for (const file of await listMarkdown(reviewRoot)) {
    if (file === indexPath || file.includes(`${path.sep}reports${path.sep}`) || file.includes(`${path.sep}strategies${path.sep}`)) continue;
    const source = await readFile(file, 'utf8');
    const frontmatter = /^---\n([\s\S]*?)\n---/m.exec(source)?.[1] || '';
    const title = /^title:\s*["']?(.*?)["']?$/m.exec(frontmatter)?.[1] || path.basename(file, '.md');
    const order = Number(/^order:\s*(\d+)/m.exec(frontmatter)?.[1] || '0');
    const relative = path.relative(reviewRoot, file).replace(/\\/g, '/').replace(/\.md$/, '');
    pages.push({ title, order, relative });
  }
  pages.sort((left, right) => right.order - left.order || left.relative.localeCompare(right.relative));
  const links = pages.map((page) => `- [${page.title}](./${page.relative})`).join('\n');
  await writeFile(indexPath, `${prefix}\n\n${links}\n`);
}

async function main() {
  if (reconcileLegacy) {
    const result = await reconcileLegacyArticles();
    console.log(JSON.stringify({ dryRun, replaced: result.replacements.length, ambiguous: result.ambiguous.length }, null, 2));
    return;
  }
  const contents = await readFile(inputPath, 'utf8');
  const seen = new Set();
  const records = contents.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
    .filter((record) => record.account === '爱在冰川' && record.source_url)
    .filter((record) => {
      const key = record.canonical_key || normalizeUrl(record.source_url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const selected = limit ? records.slice(0, limit) : records;
  const documents = await existingDocuments();
  const state = await readState();
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < selected.length) {
      const index = cursor++;
      const record = selected[index];
      try {
        const result = await importOne(record, documents, state);
        results[index] = result;
        if (!dryRun && result.status !== 'skipped') await queueStateWrite(state);
        if (result.status !== 'skipped' || (index + 1) % 100 === 0) {
          console.log(`[${index + 1}/${selected.length}] ${result.status} ${record.published_date} ${result.title || record.title} (${result.images ?? 0} images)`);
        }
      } catch (error) {
        results[index] = { status: 'failed', record, reason: error.message };
        console.error(`[${index + 1}/${selected.length}] failed ${record.source_url}: ${error.message}`);
      }
      if (delayMs) await sleep(delayMs);
    }
  }
  await mkdir(cacheRoot, { recursive: true });
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (!dryRun) await rebuildIndex();
  const summary = results.reduce((total, item) => ({ ...total, [item.status]: (total[item.status] || 0) + 1 }), {});
  const failures = results.filter((item) => item.status === 'failed' || item.failures?.length);
  if (!dryRun) {
    await mkdir(reportRoot, { recursive: true });
    await writeFile(path.join(reportRoot, 'crawl-report-provided-links.md'), [
      '---', 'title: 提供链接批量导入报告', '---', '',
      `- 输入文章：${selected.length}`,
      `- 新增：${summary.added || 0}`,
      `- 替换：${summary.replaced || 0}`,
      `- 跳过：${summary.skipped || 0}`,
      `- 失败：${summary.failed || 0}`,
      '', '## 失败或图片失败', '',
      ...failures.map((item) => `- ${item.record.published_date} ${item.record.title}：${item.reason || item.failures.map((failure) => failure.url).join('、')}（${item.record.source_url}）`),
      '',
    ].join('\n'));
  }
  console.log(JSON.stringify({ input: selected.length, ...summary, failures: failures.length, dryRun }, null, 2));
}

main().catch((error) => {
  console.error(`Import failed: ${error.stack || error.message}`);
  process.exitCode = 1;
});
