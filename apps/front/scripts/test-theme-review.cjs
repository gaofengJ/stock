const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const content = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/analysis/limits/theme-review-content.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(content);
const { reviewContent, reviewPoint, reviewSummary } = content;

test('company summary excludes shared industry context and citation boilerplate', () => {
  const input = '行业原因：\n1、行业会议召开。\n公司原因：\n1、据2026年9月30日公告，公司拟转让7.00%股份，但不导致控制人变化。\n2、公司增长51.63%。\n（免责声明：以公告为准）';
  assert.equal(reviewSummary(input), '公司拟转让7.00%股份，但不导致控制人变化。');
  assert.deepEqual(reviewContent(input), {
    company: ['据2026年9月30日公告，公司拟转让7.00%股份，但不导致控制人变化。', '公司增长51.63%。'],
    industry: ['行业会议召开。'], disclaimer: ['（免责声明：以公告为准）'],
  });
});
test('unnumbered text, decimals and missing company data remain honest', () => {
  assert.equal(reviewSummary(null), '');
  assert.equal(reviewSummary('1.77亿元收入，同比增长91.88%。'), '1.77亿元收入，同比增长91.88%。');
  assert.equal(reviewSummary('行业原因：\n1、板块走强'), '');
  assert.equal(reviewSummary('1、据2026年7月9日互动易，公司营收1.77亿元，同比增长91.88%。'), '公司营收1.77亿元，同比增长91.88%。');
  assert.deepEqual(reviewPoint('公司无相关业务，尚未产生收入。'), { text: '公司无相关业务，尚未产生收入。', source: '' });
  assert.deepEqual(reviewContent('原文第一段\r\n原文第二段').company, ['原文第一段', '原文第二段']);
});
test('citation is retained for the detail view and content is not shortened', () => {
  const original = '据2026年9月30日公告，公司拟收购，但方案尚未获批且存在终止风险。';
  const point = reviewPoint(original);
  assert.equal(point.source + '，' + point.text, original);
  assert.equal(reviewSummary('1、' + original), point.text);
});
