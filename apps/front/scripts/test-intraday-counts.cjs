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
const { intradayPlot, intradayMean, intradayCloses, intradayPhase, intradayDistribution } = sandbox.exports;
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
  assert.equal(rows.some((row) => row.label.endsWith('close')), false);
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


test('adjacent historical sessions join directly without inventing overnight values', () => {
  const rows = intradayPlot([
    { ...point('2026-09-29', '15:00', 2000), source: 'history_5m' },
    { ...point('2026-09-30', '09:35', 3000), source: 'history_5m' },
  ], ['2026-09-29', '2026-09-30']);
  const close = rows.findIndex((row) => row.time === '15:00');
  assert.equal(rows[close + 1].date, '2026-09-30');
  assert.equal(rows[close + 1].time, '09:35');
  assert.equal(rows[close + 1].first, true);
  assert.equal(rows[close].point.up, 2000);
  assert.equal(rows[close + 1].point.up, 3000);
});

test('single-line mean includes zero and omits missing samples; multiple or no lines have no mean', () => {
  const rows = intradayPlot([
    point('2026-09-30', '09:30', 0, 4000),
    point('2026-09-30', '09:40', 2000, 2000),
  ], ['2026-09-30']);
  assert.equal(intradayMean(rows, {}), null);
  assert.equal(intradayMean(rows, { '上涨家数': false, '下跌家数': false }), null);
  assert.equal(intradayMean(rows, { '下跌家数': false }).value, 1000);
  assert.equal(intradayMean(rows, { '上涨家数': false }).value, 3000);
  assert.equal(intradayMean([], { '上涨家数': false }), null);
});


const observations = (values) => values.map((up) => ({ point: { up } }));

test('relative boundaries follow selected observations, include zero and exclude invalid samples', () => {
  const distribution = intradayDistribution(observations([0, 100, 200, 300, 400, null, undefined, NaN, Infinity, -1]));
  assert.equal(distribution.ice, 80);
  assert.equal(distribution.boiling, 320);
  assert.equal(distribution.count, 5);
  assert.equal(intradayPhase(80, distribution), '冰点');
  assert.equal(intradayPhase(200, distribution), '常规区间');
  assert.equal(intradayPhase(320, distribution), '沸点');
  const shifted = intradayDistribution(observations([3000, 3100, 3200, 3300, 3400]));
  assert.equal(shifted.ice, 3080);
  assert.equal(shifted.boiling, 3320);
  assert.equal(intradayPhase(3000, shifted), '冰点');
  assert.equal(intradayPhase(300, distribution), '常规区间');
  assert.equal(intradayDistribution([]), null);
  for (const value of [null, undefined, NaN, Infinity, -1]) assert.equal(intradayPhase(value, distribution), null);
});

test('small, flat or concentrated samples do not force ice or boiling classifications', () => {
  for (const values of [[0], [1, 2, 3, 4], [2000, 2000, 2000, 2000, 2000], [100, 100, 100, 100, 100, 100, 100, 100, 100, 5000]]) {
    const distribution = intradayDistribution(observations(values));
    assert.equal(distribution.canClassify, false);
    assert.equal(intradayPhase(values[0], distribution), '常规区间');
  }
});

test('percentiles retain precision and are not pulled toward a single outlier', () => {
  const distribution = intradayDistribution(observations([0, 1, 2, 3, 4, 5, 6, 7, 8, 10000]));
  assert.equal(distribution.ice, 1.8);
  assert.equal(distribution.boiling, 7.2);
});

test('daily close overview preserves missing closes and never substitutes an unfinished session', () => {
  const rows = intradayPlot([
    point('2026-09-28', '15:00', 4000),
    point('2026-09-29', '14:55', 600),
    point('2026-09-30', '10:00', 1200),
  ], ['2026-09-28', '2026-09-29', '2026-09-30']);
  const closes = JSON.parse(JSON.stringify(intradayCloses(rows)));
  assert.deepEqual(closes, [['2026-09-28 15:00', 4000], ['2026-09-29 15:00', null]]);
  assert.equal(intradayCloses([]).length, 0);
});

// Exercise the component's requests and controls without ECharts or a browser.
function chartHarness(selectedDate = '') {
  const values = []; const dependencies = []; let cursor = 0; let effectCursor = 0; let effects = []; let timer;
  const requests = []; const doc = { hidden: false, addEventListener() {}, removeEventListener() {} };
  const react = require('react');
  const noop = () => null;
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useEffect(effect, deps) { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) effects.push(effect); dependencies[index] = deps; },
    useCallback(fn) { return fn; },
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/analysis/components/IntradayCountsChart.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', 'setInterval', 'clearInterval', 'document', code)(exports, name => {
    if (name === 'react') return { ...react, ...hooks };
    if (name === 'dayjs') return { default: require('dayjs') };
    if (name === 'antd') return Object.fromEntries(['Alert','Button','Card','DatePicker','Empty','Select','Space'].map(k => [k, k]));
    if (name === './MarketContext') return { useMarket: () => ({ date: '2026-10-14', selectedDate }) };
    if (name === '@/api/market') return { marketRequest: (_endpoint, params) => { requests.push(params); return Promise.resolve({data:{}}); } };
    if (name === '@/hooks/useLatestRequest') return { useLatestRequest: () => ({ requestConfig: {}, runLatestRequest: options => options.request() }) };
    if (name === '@/components/SiteTheme') return { useSiteTheme: () => ({ colors: {} }) };
    if (name === './intraday-counts-plot') return sandbox.exports;
    if (name === '@/utils/format') return { numberText: String };
    if (name === '@/colors') return { chartColors: {}, quoteColors: {} };
    if (name.startsWith('@/') || name.endsWith('.css')) return { default: noop, LoadingOverlay: noop };
    return require(name);
  }, fn => { timer = fn; return 1; }, () => {}, doc);
  const render = () => { cursor = 0; effectCursor = 0; effects = []; const tree = exports.default(); effects.forEach(effect => effect()); return tree; };
  return { requests, render, poll: () => timer(), doc };
}
function findElement(node, type) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === type) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findElement(child, type); if (found) return found;
  }
  return null;
}
test('intraday defaults to live even when daily status is yesterday, and polls only while visible', () => {
  const chart = chartHarness(); chart.render();
  assert.deepEqual(chart.requests.at(-1), { days: 10 });
  chart.poll(); assert.equal(chart.requests.length, 2);
  chart.doc.hidden = true; chart.poll(); assert.equal(chart.requests.length, 2);
});
test('explicit review dates stay historical; the live button clears the request cutoff', () => {
  const chart = chartHarness('2026-10-14'); const tree = chart.render();
  assert.deepEqual(chart.requests.at(-1), { days: 10, date: '2026-10-14' });
  chart.poll(); assert.equal(chart.requests.at(-1).date, '2026-10-14');
  findElement(tree, 'Button').props.onClick(); chart.render();
  assert.deepEqual(chart.requests.at(-1), { days: 10 });
});
