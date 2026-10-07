const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../docs/.vitepress/dist');
const catalog = require('../docs/.vitepress/theme/library-catalog.json');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(home, /最新收录复盘/);
assert.match(home, new RegExp(catalog.latestDate));
assert.match(home, /library-index/);
assert.match(home, /查阅每日复盘/);
const archive = fs.readFileSync(path.join(root, 'reviews/index.html'), 'utf8');
assert.match(archive, /archive-filters/);
assert.match(archive, /年度精华/);
assert.ok(!archive.includes('分享文章'), 'Directory pages do not share an article');
assert.ok(!archive.includes('VPSidebar '), 'Archive directory uses the same full-width layout as home');
for (let year = 2017; year <= 2026; year++) assert.ok(archive.includes(`review-summary-${year}`));
assert.ok(fs.existsSync(path.join(root, 'pagefind/pagefind.js')));
let pages = 0;
const failures = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!['imgs', 'pagefind', 'assets'].includes(entry.name)) walk(file); continue; }
    if (!entry.name.endsWith('.html')) continue;
    pages++;
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/(?:href|src)="(\/blog-frame\/[^"?#]*)/g)) {
      let resource;
      try { resource = decodeURIComponent(match[1].slice('/blog-frame/'.length)); } catch { failures.push(match[1]); continue; }
      if (![resource, `${resource}.html`, `${resource}/index.html`].some(value => fs.existsSync(path.join(root, value)))) failures.push(`${path.relative(root, file)} -> ${resource}`);
    }
  }
}
walk(root);
assert.ok(pages > 2000, 'All articles rendered');
assert.equal(failures.length, 0, `Missing local links/assets:\n${[...new Set(failures)].slice(0, 30).join('\n')}`);
const latest = fs.readFileSync(path.join(root, catalog.latest[0].path + '.html'), 'utf8');
assert.match(latest, /data-pagefind-filter="分类"/);
assert.match(latest, /loading="lazy"/);
assert.ok(latest.includes(`复盘日期：${catalog.latestDate}`));
console.log(`Verified ${pages} pages, source/date metadata, search output and local resources.`);
