#!/usr/bin/env node
/**
 * Move PDF-imported images into the regular annual layout and reduce image bytes
 * without changing dimensions. PNG/JP2 are encoded losslessly; JPEG uses
 * high-quality WebP and is kept only when smaller. GIF is left untouched.
 */
import { cpus } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import sharp from 'sharp';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const BLOG_ROOT = path.resolve(SCRIPT_DIR, '..');
const IMAGE_ROOT = path.join(BLOG_ROOT, 'docs/src/public/imgs/aizaibingchuan');
const PDF_ROOT = path.join(IMAGE_ROOT, 'pdf');
const REVIEW_ROOT = path.join(BLOG_ROOT, 'docs/src/reviews/aizaibingchuan');
const IMAGE_URL_PREFIX = '/imgs/aizaibingchuan/';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const qualityIndex = args.indexOf('--jpeg-quality');
const jpegQuality = qualityIndex === -1 ? 92 : Number(args[qualityIndex + 1]);
const concurrency = Math.max(1, Math.min(cpus().length, 4));

if (!Number.isInteger(jpegQuality) || jpegQuality < 80 || jpegQuality > 100) {
  throw new Error('--jpeg-quality must be an integer from 80 to 100.');
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(target);
    return entry.isFile() ? [target] : [];
  }));
  return nested.flat();
}

async function movePdfYears() {
  if (!(await exists(PDF_ROOT))) return 0;
  let moved = 0;
  for (const entry of await readdir(PDF_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^20\d{2}$/.test(entry.name)) continue;
    const source = path.join(PDF_ROOT, entry.name);
    const target = path.join(IMAGE_ROOT, entry.name);
    if (await exists(target)) {
      throw new Error(`Cannot move ${source}: target already exists: ${target}`);
    }
    if (!dryRun) await rename(source, target);
    moved += 1;
  }
  if (!dryRun && (await readdir(PDF_ROOT)).length === 0) await rm(PDF_ROOT, { recursive: true });
  return moved;
}

async function optimizeImage(input) {
  let temporary;
  try {
    const originalBytes = (await stat(input)).size;
    const metadata = await sharp(input, { animated: true, failOn: 'none' }).metadata();
    if (metadata.format === 'gif' || metadata.format === 'webp') {
      return { status: 'skipped', input, originalBytes };
    }
    if (!['png', 'jpeg', 'jp2'].includes(metadata.format)) {
      return { status: 'skipped', input, originalBytes };
    }

    const output = input.replace(/\.[^.]+$/, '.webp');
    temporary = `${output}.tmp`;
    if (await exists(output)) {
      return { status: 'skipped', input, originalBytes, error: `output exists: ${output}` };
    }
    const encoder = metadata.format === 'png' || metadata.format === 'jp2'
      ? { lossless: true, effort: 6 }
      : { quality: jpegQuality, effort: 6 };
    if (!dryRun) {
      await sharp(input, { animated: false, failOn: 'none' }).webp(encoder).toFile(temporary);
    }
    const outputBytes = dryRun ? 0 : (await stat(temporary)).size;
    if (!dryRun && outputBytes < originalBytes) {
      await rename(temporary, output);
      await unlink(input);
      return { status: 'optimized', input, output, originalBytes, outputBytes };
    }
    if (!dryRun) await rm(temporary, { force: true });
    return { status: 'unchanged', input, originalBytes, outputBytes };
  } catch (error) {
    if (!dryRun && temporary) await rm(temporary, { force: true });
    return { status: 'failed', input, error: error.message };
  }
}

async function mapWithConcurrency(items, action) {
  const result = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      result[index] = await action(items[index], index);
      if ((index + 1) % 100 === 0) console.log(`Processed ${index + 1}/${items.length} images`);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return result;
}

async function updateMarkdownReferences(replacements) {
  const files = (await listFiles(REVIEW_ROOT)).filter((file) => file.endsWith('.md'));
  let changed = 0;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    let output = source.replaceAll('/imgs/aizaibingchuan/pdf/', IMAGE_URL_PREFIX);
    for (const [from, to] of replacements) output = output.replaceAll(from, to);
    if (output !== source) {
      if (!dryRun) await writeFile(file, output);
      changed += 1;
    }
  }
  return changed;
}

async function main() {
  const movedYears = await movePdfYears();
  const files = await listFiles(IMAGE_ROOT);
  const results = await mapWithConcurrency(files, optimizeImage);
  const replacements = results
    .filter((result) => result.status === 'optimized')
    .map((result) => [
      IMAGE_URL_PREFIX + path.relative(IMAGE_ROOT, result.input).split(path.sep).join('/'),
      IMAGE_URL_PREFIX + path.relative(IMAGE_ROOT, result.output).split(path.sep).join('/'),
    ]);
  const markdownFiles = await updateMarkdownReferences(replacements);
  const stats = results.reduce((total, result) => {
    total[result.status] = (total[result.status] || 0) + 1;
    total.originalBytes += result.originalBytes || 0;
    total.outputBytes += result.status === 'optimized'
      ? result.outputBytes
      : result.originalBytes || 0;
    return total;
  }, { originalBytes: 0, outputBytes: 0 });
  console.log(JSON.stringify({
    dryRun,
    movedYears,
    markdownFiles,
    optimized: stats.optimized || 0,
    unchanged: stats.unchanged || 0,
    skipped: stats.skipped || 0,
    failed: stats.failed || 0,
    beforeBytes: stats.originalBytes,
    afterBytes: stats.outputBytes,
    savedBytes: stats.originalBytes - stats.outputBytes,
  }, null, 2));
}

main().catch((error) => {
  console.error(`Image optimization failed: ${error.message}`);
  process.exitCode = 1;
});
