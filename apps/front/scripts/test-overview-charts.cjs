const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', code)((name) => imports[name] || require(name), exports);
  return exports;
}
const format = load('utils/format.ts');
const { overviewDateAxis, hoverAverageLabel } = load('app/analysis/components/overview-chart.ts', { '@/utils/format': format });
const { pairedIndexCandles } = load('app/analysis/components/market-display.ts');
const { default: QuotePanel, IndexQuoteReadout } = load('app/analysis/components/IndexQuotePanel.tsx', { '@/utils/format': format });

test('equal date windows select the same ticks and retain both endpoints', () => {
  for (const length of [1, 2, 20, 60, 120, 250, 500]) {
    const dates = Array.from({ length }, (_, i) => `2026-${String(i)}`);
    const axis = overviewDateAxis(dates);
    const ticks = dates.filter((_, i) => axis.axisLabel.interval(i));
    assert.equal(ticks[0], dates[0]);
    assert.equal(ticks.at(-1), dates.at(-1));
    assert.ok(ticks.length <= 5);
    assert.equal(axis.axisLabel.formatter('2026-09-30'), '09-30');
  }
});

const dates = ['2026-09-21', '2026-09-22'];
const points = [
  {date:dates[0], open:100, high:110, low:95, close:105, preClose:100, vol:10000, amount:200000},
  {date:dates[1], open:105, high:125, low:102, close:120, preClose:105, vol:20000, amount:300000},
];
function panel(rows, period, date = dates.at(-1)) {
  return renderToStaticMarkup(React.createElement(IndexQuoteReadout, {
    date, name:'示例指数', points:rows, candles:pairedIndexCandles(rows, dates, period),
    averages:[{name:'MA5',values:[100,110]}], palette:['red'],
  }));
}
function field(html, name) {
  return html.match(new RegExp(`<dt>${name}</dt><dd[^>]*>(.*?)</dd>`))[1].replace(/<[^>]*>/g, '');
}
test('hover readout uses the selected day, with daily return and original amount converted once', () => {
  const html = panel(points, 'day');
  assert.match(html, /<time>2026-09-22<\/time>/);
  assert.equal(field(html, '收盘'), '120.00');
  assert.equal(field(html, '涨幅'), '+14.29%');
  assert.equal(field(html, '成交量'), '2.00万手');
  assert.equal(field(html, '成交额'), '3.00亿元');

});
test('weekly readout uses first prior close, period high-low, and summed turnover', () => {
  const html = panel(points, 'week');
  assert.equal(field(html, '涨跌'), '+20.00');
  assert.equal(field(html, '涨幅'), '+20.00%');
  assert.equal(field(html, '振幅'), '30.00%');
  assert.equal(field(html, '成交量'), '3.00万手');
  assert.equal(field(html, '成交额'), '5.00亿元');
});
test('missing quote values remain missing while valid zero volume and turnover are displayed', () => {
  const zero = panel([points[0], {...points[1], vol:0, amount:0}], 'day');
  assert.equal(field(zero, '成交量'), '0.00万手');
  assert.equal(field(zero, '成交额'), '0.00亿元');
  const missing = panel([points[0], {...points[1], preClose:undefined, amount:undefined}], 'day');
  assert.equal(field(missing, '涨幅'), '—');
  assert.equal(field(missing, '成交额'), '—');
  const incomplete = panel([points[0]], 'week');
  assert.equal(field(incomplete, '收盘'), '—');
  assert.equal(field(incomplete, '成交额'), '—');
});

test('readout is absent before hover and after leave, without falling back to the latest day', () => {
  assert.equal(panel(points, 'day', null), '');
  assert.equal(panel(points, 'day', '2026-01-01'), '');
  const initial = renderToStaticMarkup(React.createElement(QuotePanel, {name:'示例指数', points, candles:pairedIndexCandles(points, dates, 'day')}, 'chart'));
  assert.match(initial, /chart/);
  assert.doesNotMatch(initial, /行情明细|<aside|<time/);
  assert.equal(field(panel(points, 'day', dates[0]), '收盘'), '105.00');
});

test('one legend row shows values only for hover and restores clickable names on leave', () => {
  const candles = dates.map(date=>({date}));
  const averages = [{name:'MA5',values:[100,110]}, {name:'MA250',values:[null,null]}];
  assert.equal(hoverAverageLabel('MA5',null,candles,averages),'MA5');
  assert.equal(hoverAverageLabel('MA5',dates[1],candles,averages),'MA5: 110.00↑');
  assert.equal(hoverAverageLabel('MA250',dates[1],candles,averages),'MA250: —');
  assert.equal(hoverAverageLabel('MA5',null,candles,averages),'MA5');
});
