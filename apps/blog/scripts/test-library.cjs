const { test } = require('node:test');
const assert = require('node:assert/strict');
const { metadata, frontmatter } = require('./article-metadata.cjs');
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
