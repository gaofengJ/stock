const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = path.join(__dirname, '../src/app/analysis/components/intraday-counts-plot.ts');
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox);
const { intradayPlot } = sandbox.exports;
const point = (date, time, up = 2567, down = 2824) => ({
  date, time, up, down, collectedAt: date + 'T01:35:00Z',
});

test('missing five-minute samples stay null, lunch is compressed and no future samples are created', () => {
  const rows = intradayPlot([
    point('2026-09-29', '09:35'), point('2026-09-29', '15:00'),
    point('2026-09-30', '09:35'),
  ], ['2026-09-29', '2026-09-30']);
  assert.equal(rows.filter((row) => row.date === '2026-09-29' && row.time).length, 50);
  assert.equal(rows.find((row) => row.label === '2026-09-29 09:40').point, null);
  assert.equal(rows.some((row) => row.time === '12:00'), false);
  assert.equal(rows.some((row) => row.label === '2026-09-30 09:40'), false);
  assert.equal(rows.find((row) => row.label === '2026-09-29 close').point, null);
  assert.equal(rows.at(-1).point.up, 2567);
});

test('empty history has no invented points and a single sample is visible', () => {
  assert.equal(intradayPlot([], []).length, 0);
  const rows = intradayPlot([point('2026-09-30', '09:30')], ['2026-09-30']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].point.down, 2824);
});

test('historical five-minute bar ends have 48 slots and no artificial midday gap', () => {
  const rows = intradayPlot([
    { ...point('2026-09-30', '09:35'), source: 'history_5m' },
    { ...point('2026-09-30', '15:00'), source: 'history_5m' },
  ], ['2026-09-30']);
  assert.equal(rows.length, 48);
  assert.equal(rows[0].time, '09:35');
  assert.equal(rows[24].time, '13:05');
  assert.equal(rows.some((row) => row.time === '13:00'), false);
});
