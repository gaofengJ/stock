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
const { overviewDateAxis } = load('app/analysis/components/overview-chart.ts');
const format = load('utils/format.ts');
const { pairedIndexCandles } = load('app/analysis/components/market-display.ts');
const { default: QuotePanel } = load('app/analysis/components/IndexQuotePanel.tsx', { '@/utils/format': format });

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
function panel(rows, period) {
  return renderToStaticMarkup(React.createElement(QuotePanel, {
    name:'示例指数', points:rows, candles:pairedIndexCandles(rows, dates, period),
    averages:[{name:'MA5',values:[100,110]}], palette:['red'],
  }));
}
function field(html, name) {
  return html.match(new RegExp(`<dt>${name}</dt><dd[^>]*>(.*?)</dd>`))[1].replace(/<[^>]*>/g, '');
}
test('quote panel defaults to latest day, with daily return and original amount converted once', () => {
  const html = panel(points, 'day');
  assert.match(html, /<time>2026-09-22<\/time>/);
  assert.equal(field(html, '收盘'), '120.00');
  assert.equal(field(html, '涨幅'), '+14.29%');
  assert.equal(field(html, '成交量'), '2.00万手');
  assert.equal(field(html, '成交额'), '3.00亿元');
  assert.match(html, /MA5: 110.00↑/);
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
