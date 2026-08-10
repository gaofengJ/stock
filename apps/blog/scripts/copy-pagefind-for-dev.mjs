import { cp, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const blogDir = resolve(scriptDir, '..');
const sourceDir = resolve(blogDir, 'docs/.vitepress/dist/pagefind');
const targetDir = resolve(blogDir, 'docs/src/public/pagefind');

await rm(targetDir, { recursive: true, force: true });
await cp(sourceDir, targetDir, { recursive: true });
