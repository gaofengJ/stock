const { test } = require('node:test');
const assert = require('node:assert/strict');
const { metadata, frontmatter } = require('./article-metadata.cjs');
const fs = require('node:fs');
const path = require('node:path');
const vite = require.resolve('vite', { paths: [require.resolve('vitepress')] });
const esbuild = require(require.resolve('esbuild', { paths: [vite] }));
const archive = {};
new Function('exports', 'module', esbuild.transformSync(fs.readFileSync(path.resolve(__dirname, '../docs/.vitepress/theme/archive-utils.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code)(archive, { get exports() { return archive; }, set exports(value) { Object.assign(archive, value); } });
test('keeps review date separate from publication date and original source', () => {
  const m = metadata('reviews/aizaibingchuan/2026/article.md', { published_at: '2026-08-20 07:20', source_url: 'https://xueqiu.com/4104161666/405764562' }, '2026-8-19 数据');
  assert.equal(m.date, '2026-08-19');
  assert.equal(m.published, '2026-08-20');
  assert.equal(m.year, '2026');
  assert.equal(m.source, '雪球 · 爱在冰川');
});
test('does not invent dates or accept unsafe source links', () => {
  const m = metadata('trading-rules/base-rules/st-rules.md', { source_url: 'javascript:alert(1)' }, 'ST 规则');
  assert.equal(m.category, '交易规则');
  assert.equal(m.year, '未标注');
  assert.equal(m.sourceUrl, '');
  assert.equal(m.date, '');
});
test('parses quoted titles and source fields with CRLF exports', () => {
  const fm = frontmatter('---\r\ntitle: "2026-8-19 数据"\r\npublished_at: "2026-08-20 07:20"\r\n---\r\n# 本文');
  assert.equal(fm.title, '2026-8-19 数据');
  assert.equal(fm.published_at, '2026-08-20 07:20');
});

test('normalizes archive dates and rejects impossible calendar dates', () => {
  assert.equal(archive.archiveDate({ text: '2026-8-9-0038', link: '/a' }), '2026-08-09');
  assert.equal(archive.archiveDate({ text: '2024-2-29', link: '/a' }), '2024-02-29');
  for (const text of ['2026-2-29', '2026-13-1', '2026-0-1', '2026-1-0', '年度精华']) assert.equal(archive.archiveDate({ text, link: '/a' }), '');
});

test('month and date filtering preserve every version and use numeric date order', () => {
  const items = [
    { text: '2026-8-9', link: '/first' }, { text: '2026-8-19', link: '/new' },
    { text: '2026-8-9-0038', link: '/second' }, { text: '2026-7-31', link: '/july' },
  ];
  const groups = archive.archiveMonths(items);
  assert.deepEqual(groups.map(group => group.month), ['2026-08', '2026-07']);
  assert.equal(groups.flatMap(group => group.items).length, items.length);
  assert.deepEqual(archive.filterArchive(items, '2026-08', '').map(item => item.link), ['/new', '/first', '/second']);
  assert.deepEqual(archive.filterArchive(items, '', '2026-08-09').map(item => item.link), ['/first', '/second']);
  assert.equal(archive.filterArchive(items, '', '2026-08-10').length, 0);
  assert.equal(archive.filterArchive(items, '', '').length, 4);
  assert.equal(items[0].link, '/first');
});

test('display titles keep original subjects and distinguish same-date versions', () => {
  assert.equal(archive.reviewTitle('2026-8-19 数据'), '复盘数据');
  assert.equal(archive.reviewTitle('肘墨鱼块'), '肘墨鱼块');
  assert.equal(archive.reviewTitle('2026-8-19 市场分歧'), '市场分歧');
  assert.equal(archive.archiveLabel({ text: '2026-8-9-0038', link: '/a' }), '2026-08-09（版本 0038）');
});
