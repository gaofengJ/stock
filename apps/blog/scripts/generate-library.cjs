const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIES, metadata, frontmatter } = require('./article-metadata.cjs');
const root = path.resolve(__dirname, '../docs/src');
const articles = [];
const reports = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'public') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!entry.name.endsWith('.md')) continue;
    const relative = path.relative(root, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    if (relative.includes('/reports/')) {
      if (/crawl-report|import-report/.test(entry.name)) reports.push({ title: frontmatter(text).title || entry.name, failed: Number(text.match(/^- 失败(?:文章)?[：:]\s*(\d+)/m)?.[1] || 0) });
      continue;
    }
    if (entry.name === 'index.md') continue;
    const fm = frontmatter(text);
    const title = fm.title || text.match(/^#\s+(.+)$/m)?.[1] || entry.name;
    articles.push({ title, path: `/${relative.replace(/\.md$/, '')}`, ...metadata(relative, fm, title) });
  }
}
walk(root);
const sorted = articles.filter(a => a.date && /^\/reviews\/aizaibingchuan\/\d{4}\//.test(a.path)).sort((a, b) => b.date.localeCompare(a.date) || b.published.localeCompare(a.published) || a.path.localeCompare(b.path));
const catalog = {
  total: articles.length,
  latestDate: sorted[0]?.date || '',
  latest: sorted.slice(0, 12),
  categories: Object.entries(CATEGORIES).map(([key, name]) => ({ key, name, count: articles.filter(a => a.category === name).length })),
  importFailures: reports.reduce((sum, item) => sum + item.failed, 0),
};
fs.writeFileSync(path.resolve(__dirname, '../docs/.vitepress/theme/library-catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(`Library: ${catalog.total} articles, latest ${catalog.latestDate}, recorded import failures ${catalog.importFailures}`);
