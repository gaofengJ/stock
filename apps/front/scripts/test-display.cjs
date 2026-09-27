const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', code)((name) => imports[name] || require(name), exports);
  return exports;
}
const format = load('utils/format.ts');
test('missing and non-finite values remain distinct from real zero', () => {
  for (const value of [null, undefined, '', ' ', NaN, Infinity, -Infinity, true, {}, 'unknown']) assert.equal(format.numberText(value), '—');
  assert.equal(format.numberText(0), '0.00');
  assert.equal(format.numberText('0'), '0.00');
});
test('precision, grouping, signs and negative zero are consistent', () => {
  assert.equal(format.numberText(16685.034529), '16,685.03');
  assert.equal(format.numberText(-0.00004, 2, true), '0.00');
  assert.equal(format.numberText(1.237, 2, true), '+1.24');
  assert.equal(format.numberText(-1.237, 2, true), '-1.24');
  assert.equal(format.numberText(4306, 0), '4,306');
  assert.equal(format.numberText(1.005), '1.01');
  assert.equal(format.numberText(-1.005), '-1.01');
  assert.equal(format.changeClass(-0.00004), 'quote-flat');
});
test('each source amount is converted once and preserves missing values', () => {
  assert.equal(format.scaledNumber(1234567, 10), '123,456.70'); // 千元 -> 万元
  assert.equal(format.scaledNumber(1234567, 100000), '12.35'); // 千元 -> 亿元
  assert.equal(format.scaledNumber(1234567, 10000), '123.46'); // 万元 -> 亿元
  assert.equal(format.scaledNumber(1234567890, 100000000), '12.35'); // 元 -> 亿元
  for (const value of [null, undefined, '']) assert.equal(format.scaledNumber(value, 10000), '—');
});
test('historical update times use Beijing timezone including year boundaries', () => {
  assert.equal(format.beijingTime('2024-12-31T17:02:00.000Z'), '2025-01-01 01:02');
  assert.equal(format.beijingTime('invalid'), '—');
});
const dates = load('hooks/useDefaultTradeDate.ts', { '@/api/services': {}, '@/api/errors': {} });
test('default trade date switches at 20:30 Beijing regardless of system timezone', () => {
  assert.equal(dates.getCandidateDate(new Date('2026-09-24T12:29:59Z')).format('YYYY-MM-DD'), '2026-09-23');
  assert.equal(dates.getCandidateDate(new Date('2026-09-24T12:30:00Z')).format('YYYY-MM-DD'), '2026-09-24');
  assert.equal(dates.getCandidateDate(new Date('2025-01-01T00:00:00Z')).format('YYYY-MM-DD'), '2024-12-31');
});
