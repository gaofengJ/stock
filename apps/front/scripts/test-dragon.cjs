const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/analysis/dragon/dragon-display.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', code)(exportsObject);
const { fundingPeriod, filterDragonRows, flowValue, periodValue, dragonRowKey, reasonLabel } = exportsObject;

test('reporting periods prioritize explicit multi-day wording and never guess unmarked reasons', () => {
  assert.equal(fundingPeriod('有价格涨跌幅限制的日收盘价格涨幅偏离值达到7%的证券'), 'day');
  assert.equal(fundingPeriod('连续三个交易日内日收盘价格涨幅偏离值累计达到20%的证券'), 'multi');
  assert.equal(fundingPeriod('3日累计换手率达到规定值'), 'multi');
  assert.equal(fundingPeriod('异常交易证券'), 'unspecified');
  assert.equal(fundingPeriod('2026年10月3日交易异常'), 'unspecified');
  assert.equal(reasonLabel('有价格涨跌幅限制的日收盘价格跌幅偏离值达到7%的证券'), '跌幅偏离');
  assert.equal(reasonLabel('日换手率达到20%的证券'), '换手率');
});
test('combined filters retain individual reasons and distinguish missing, zero and negative funds', () => {
  const rows = [
    { tsCode: '600001.SH', name: '甲', reason: '日涨幅偏离值', netAmount: 100 },
    { tsCode: '600001.SH', name: '甲', reason: '连续三个交易日涨幅偏离值', netAmount: -200 },
    { tsCode: '000002.SZ', name: '乙', reason: '日换手率', netAmount: 0 },
    { tsCode: '000003.SZ', name: '丙', reason: '异常交易', netAmount: null },
  ];
  assert.deepEqual(filterDragonRows(rows, ' 600001.sh ', 'all', 'all'), rows.slice(0, 2));
  assert.deepEqual(filterDragonRows(rows, '甲', 'sell', 'multi'), [rows[1]]);
  assert.deepEqual(filterDragonRows(rows, '', 'buy', 'day'), [rows[0]]);
  assert.deepEqual(filterDragonRows(rows, '', 'all', 'unspecified'), [rows[3]]);
  assert.notEqual(dragonRowKey(rows[0]), dragonRowKey(rows[1]));
});
test('invalid URL filters restore to all; valid filters survive restoration', () => {
  assert.equal(flowValue('sell'), 'sell');
  assert.equal(periodValue('unspecified'), 'unspecified');
  for (const value of [null, '', 'invalid']) {
    assert.equal(flowValue(value), 'all');
    assert.equal(periodValue(value), 'all');
  }
});
