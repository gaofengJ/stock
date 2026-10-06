const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/app/basic/trade-cal/calendar-display.ts'), 'utf8');
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const { monthDates } = sandbox.exports;
test('year and leap year dates appear exactly once across twelve compact months', () => {
  for (const [year, count] of [[2026, 365], [2028, 366]]) {
    const dates = Array.from({ length: 12 }, (_, month) => Array.from(monthDates(year, month)).filter(Boolean)).flat();
    assert.equal(dates.length, count); assert.equal(new Set(dates).size, count);
    assert.equal(dates[0], `${year}-01-01`); assert.equal(dates.at(-1), `${year}-12-31`);
  }
});
test('week columns start on Monday and six-row months retain their final days', () => {
  assert.equal(monthDates(2026, 1)[6], '2026-02-01');
  assert.equal(monthDates(2026, 2)[36], '2026-03-31');
  assert.equal(monthDates(2028, 1).filter(Boolean).length, 29);
});
