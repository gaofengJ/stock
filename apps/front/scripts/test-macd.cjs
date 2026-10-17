const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const output = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/CChart/macd.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(output);
const { calculateMacd } = output;

test('MACD matches the closed-form EMA of a linear price series and the weighted DIF signal', () => {
  const result = calculateMacd(Array.from({ length: 80 }, (_, i) => i + 1));
  const difference = (i) => 7 + 5.5 * (11 / 13) ** i - 12.5 * (25 / 27) ** i;
  for (let i = 0; i < 80; i += 1) {
    const signal = Array.from({ length: i + 1 }, (_, j) => 0.2 * 0.8 ** j * difference(i - j)).reduce((a, b) => a + b, 0);
    assert(Math.abs(result.dif[i] - difference(i)) < 1e-10);
    assert(Math.abs(result.dea[i] - signal) < 1e-10);
    assert(Math.abs(result.histogram[i] - 2 * (difference(i) - signal)) < 1e-10);
  }
  assert.equal(result.dif[0], 0);
});
test('missing prices do not become zero or alter EMA and valid zero prices remain valid', () => {
  const result = calculateMacd([...Array(34).fill(0), null, undefined, NaN, 0]);
  assert.deepEqual(result.histogram.slice(33), [0, null, null, null, 0]);
  const prices = Array.from({ length: 50 }, (_, i) => 30 + i % 7);
  const withGap = calculateMacd([...prices.slice(0, 40), null, ...prices.slice(40)]);
  assert.equal(withGap.dif[40], null);
  assert.equal(withGap.dif.at(-1), calculateMacd(prices).dif.at(-1));
});
test('appending future prices leaves historical indicator values unchanged', () => {
  const prices = Array.from({ length: 80 }, (_, i) => 50 + Math.sin(i) * 5);
  const before = calculateMacd(prices.slice(0, 60));
  const after = calculateMacd(prices);
  assert.deepEqual(after.histogram.slice(0, 60), before.histogram);
});
