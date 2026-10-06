const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', code)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), exports);
  return exports;
}
const format = load('utils/format.ts');
const data = load('components/LiveResearch/data.ts', { '@/utils/format': format });

test('business composition deduplicates revisions and never combines currencies or incomplete subtotals', () => {
  const rows = [
    { end_date: '20260630', bz_item: 'A', bz_code: 'P', curr_type: 'CNY', bz_sales: 10, update_flag: 0 },
    { end_date: '20260630', bz_item: 'A', bz_code: 'P', curr_type: 'CNY', bz_sales: 30, bz_profit: 3, update_flag: 1 },
    { end_date: '20260630', bz_item: 'B', bz_code: 'P', curr_type: 'CNY', bz_sales: 70 },
    { end_date: '20260630', bz_item: 'A', bz_code: 'P', curr_type: 'USD', bz_sales: 20 },
    { end_date: '20251231', bz_item: 'A', bz_code: 'P', curr_type: 'CNY', bz_sales: 999 },
  ];
  const result = data.businessRows(rows);
  assert.equal(result.length, 3);
  assert.equal(result.find(r => r.bz_item === 'A' && r.curr_type === 'CNY').listed_share, 30);
  assert.equal(result.find(r => r.bz_item === 'A' && r.curr_type === 'CNY').profit_margin, 10);
  assert.equal(result.find(r => r.curr_type === 'USD').listed_share, 100);
  assert.equal(data.businessRows([...rows, { end_date: '20260630', bz_item: '缺失', curr_type: 'CNY' }]).find(r => r.curr_type === 'CNY').listed_share, null);
  assert.equal(data.businessRows([...rows, { end_date: '20260630', bz_item: '合计', curr_type: 'CNY', bz_sales: 100 }]).find(r => r.curr_type === 'CNY').listed_share, null);
});

test('market margin trends require both exchanges and every numeric field, keep zeros, and exclude BSE from the labelled SSE/SZSE total', () => {
  const result = data.marginTotals([
    { trade_date: '20260930', exchange_id: 'SSE', rzye: 10, rqye: 0 },
    { trade_date: '20260930', exchange_id: 'SZSE', rzye: 20, rqye: 0 },
    { trade_date: '20260930', exchange_id: 'BSE', rzye: 100, rqye: 1 },
    { trade_date: '20260929', exchange_id: 'SSE', rzye: 10, rqye: 0 },
  ]);
  assert.equal(result[0].rzye, 30);
  assert.equal(result[0].rqye, 0);
  assert.equal(result[0].rzmre, null);
  assert.equal(result[1].rzye, null);
  assert.equal(result[1].complete, false);
});

test('changing stock/date cancels old requests and blocks late data and late errors; sources do not poll', async () => {
  let cursor = 0, effectDeps, cleanup;
  const values = [], calls = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }];
    },
    useEffect(effect, deps) {
      if (!effectDeps || deps.some((d, i) => d !== effectDeps[i])) {
        cleanup?.(); effectDeps = deps; cleanup = effect();
      }
    },
  };
  const request = { get(url, config) {
    return new Promise((resolve, reject) => calls.push({ url, config, resolve, reject }));
  } };
  const common = load('components/LiveResearch/common.tsx', {
    react, 'react/jsx-runtime': {}, antd: {}, '@/api/request': request, '@/components/DataTable': {},
    '@/components/CChart': {}, '@/components/SiteTheme': {}, '@/colors': {}, '@/utils/format': format,
    './data': data, './research.css': {},
  });
  const render = params => { cursor = 0; return common.useResearch('stock', params); };
  const first = { code: '000001.SZ', date: '2026-09-30', section: 'funds' };
  const second = { ...first, code: '600000.SH', date: '2026-08-31' };
  render(first); render(second);
  assert.equal(calls[0].config.signal.aborted, true);
  calls[1].resolve({ data: { code: second.code, sources: [] } });
  await new Promise(resolve => setImmediate(resolve));
  calls[0].resolve({ data: { code: first.code } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render(second).data.code, second.code);
  render(first); render(second);
  calls[2].reject(new Error('旧请求错误'));
  calls[3].resolve({ data: { code: second.code } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render(second).error, undefined);
  assert.equal(calls.length, 4);
  cleanup?.();
});
