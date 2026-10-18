const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function load(file, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const sandbox = { exports: {}, require, URL, URLSearchParams, AbortController, ...extra };
  vm.runInNewContext(code, sandbox);
  return sandbox.exports;
}
const display = load('app/basic/stock/detail/profile-display.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function polling() {
  let timer;
  let delay;
  const api = load('app/basic/components/workbench-polling.ts', { setTimeout: (fn, ms) => { timer = fn; delay = ms; return 1; }, clearTimeout: () => { timer = undefined; } });
  return { ...api, next: () => { const fn = timer; timer = undefined; return fn?.(); }, scheduled: () => !!timer, delay: () => delay };
}

test('a transient first read recovers without publishing a terminal error', async () => {
  for (const error of [{ response: { status: 502 } }, { code: 'ERR_NETWORK' }, { code: 'ECONNABORTED' }]) {
    const p = polling();
    let calls = 0;
    let recovering = 0;
    const values = [];
    p.startWorkbenchPolling({ read: async () => { if (++calls === 1) throw error; return { sources: [] }; }, onValue: value => values.push(value), onRetry: () => recovering++, onError: () => assert.fail(), onStopped: () => assert.fail() });
    await flush();
    assert.equal(recovering, 1);
    assert.equal(values.length, 0);
    await p.next();
    assert.equal(calls, 2);
    assert.equal(values.length, 1);
    assert.equal(p.scheduled(), false);
  }
});

test('429 waits for Retry-After instead of immediately repeating a throttled request', async () => {
  const p = polling();
  let calls = 0;
  p.startWorkbenchPolling({ read: async () => { if (++calls === 1) throw { response: { status: 429, headers: { 'retry-after': '15' } } }; return { sources: [] }; }, onValue: () => {}, onError: () => assert.fail(), onStopped: () => assert.fail() });
  await flush();
  assert.equal(p.delay(), 15000);
  await p.next();
  assert.equal(calls, 2);
  assert.equal(p.scheduled(), false);
});

test('retries are bounded and auth, validation, cancellation and business errors do not retry', async () => {
  const p = polling();
  let calls = 0;
  let errors = 0;
  p.startWorkbenchPolling({ read: async () => { calls++; throw { response: { status: 503 } }; }, onValue: () => assert.fail(), onError: () => errors++, onStopped: () => assert.fail() });
  await flush();
  for (let i = 0; i < 3; i++) await p.next();
  assert.equal(calls, 4);
  assert.equal(errors, 1);
  assert.equal(p.scheduled(), false);
  for (const error of [{ status: 401 }, { status: 403 }, { status: 422 }, { code: 'ERR_CANCELED' }, new Error('business error')]) {
    const permanent = polling();
    let count = 0;
    permanent.startWorkbenchPolling({ read: async () => { throw error; }, onValue: () => assert.fail(), onError: () => count++, onStopped: () => assert.fail() });
    await flush();
    assert.equal(count, 1);
    assert.equal(permanent.scheduled(), false);
  }
});

test('stopping during request backoff cancels the timer and never requests the old date again', async () => {
  const p = polling();
  let calls = 0;
  const stop = p.startWorkbenchPolling({ read: async () => { calls++; throw { code: 'ERR_NETWORK' }; }, onValue: () => assert.fail(), onError: () => assert.fail(), onStopped: () => assert.fail() });
  await flush();
  stop();
  assert.equal(p.scheduled(), false);
  await p.next();
  assert.equal(calls, 1);
});

test('a request failure during source refresh preserves the previous value and resumes polling', async () => {
  const p = polling();
  let calls = 0;
  let value;
  p.startWorkbenchPolling({ read: async () => { calls++; if (calls === 2) throw { response: { status: 504 } }; return { date: '2026-10-16', items: [calls], sources: [{ state: calls < 3 ? 'loading' : 'ready' }] }; }, onValue: next => { value = next; }, onError: () => assert.fail(), onStopped: () => assert.fail() });
  await flush();
  await p.next();
  assert.equal(value.items[0], 1);
  await p.next();
  assert.equal(value.items[0], 3);
  assert.equal(p.scheduled(), false);
});

test('risk sources retry after their cooldown, while quotas and unbounded retries remain stopped', async () => {
  const p = polling();
  let calls = 0;
  let stopped = 0;
  p.startWorkbenchPolling({ recoverSources: true, read: async () => { calls++; return { sources: [{ source: 'reduction_plans', state: 'stale', message: '连接失败', nextRetryAt: new Date(Date.now() + 290000).toISOString() }] }; }, onValue: () => {}, onError: () => assert.fail(), onStopped: () => stopped++ });
  await flush();
  assert(p.delay() >= 289000 && p.delay() <= 291000);
  await p.next();
  await p.next();
  assert.equal(calls, 3);
  assert.equal(stopped, 1);
  assert.equal(p.scheduled(), false);
  const quota = polling();
  quota.startWorkbenchPolling({ recoverSources: true, read: async () => ({ sources: [{ state: 'error', message: '日额度不足', nextRetryAt: new Date(Date.now() + 86400000).toISOString() }] }), onValue: () => {}, onError: () => assert.fail(), onStopped: () => assert.fail() });
  await flush();
  assert.equal(quota.scheduled(), false);
});

test('a source recovering after cooldown publishes its new result and leaves no scheduled read', async () => {
  const p = polling();
  let calls = 0;
  const values = [];
  p.startWorkbenchPolling({ recoverSources: true, read: async () => (++calls === 1 ? { sources: [{ state: 'error', message: '连接失败', nextRetryAt: new Date(Date.now() + 1000).toISOString() }] } : { sources: [{ state: 'ready' }] }), onValue: value => values.push(value), onError: () => assert.fail(), onStopped: () => assert.fail() });
  await flush();
  await p.next();
  assert.equal(values[1].sources[0].state, 'ready');
  assert.equal(p.scheduled(), false);
});

test('risk query errors show a safe reason and distinguish unloaded from preserved data', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const errors = load('api/errors.ts');
  const RiskStatus = load('app/analysis/limits/RiskStatus.tsx', { require: name => {
    if (name === '@/api/errors') return errors;
    if (name === '@/utils/format') return { beijingTime: value => value };
    if (name === '../../basic/components/source-display') return { sourceNames: {} };
    return require(name);
  } }).default;
  const props = { data: null, error: '操作过于频繁，请稍后重试', loading: false, retry: () => {} };
  let html = renderToStaticMarkup(React.createElement(RiskStatus, props));
  assert.match(html, /风险资料查询失败/);
  assert.match(html, /操作过于频繁/);
  assert.match(html, /风险资料尚未加载/);
  html = renderToStaticMarkup(React.createElement(RiskStatus, { ...props, data: { sources: [] } }));
  assert.match(html, /保留已获取资料/);
  html = renderToStaticMarkup(React.createElement(RiskStatus, { ...props, error: '', recovering: true, loading: true }));
  assert.match(html, /正在自动重试/);
  html = renderToStaticMarkup(React.createElement(RiskStatus, { ...props, error: 'SELECT password FROM secret' }));
  assert.doesNotMatch(html, /SELECT|password|secret/);
});

test('observation date links survive reload and retain the selected stock', () => {
  const url = new URL(display.profileDateHref('code=600081.SH&date=2026-09-30', '2026-08-31'), 'http://localhost');
  assert.equal(url.searchParams.get('code'), '600081.SH');
  assert.equal(display.profileDate(url.searchParams.get('date')), '2026-08-31');
  for (const value of ['2026-02-30', '2026-9-30', 'invalid', null]) assert.equal(display.profileDate(value), '');
});

test('company links normalize plain domains and reject executable protocols', () => {
  assert.equal(display.websiteHref('www.detc.com.cn'), 'https://www.detc.com.cn/');
  assert.equal(display.websiteHref('http://www.detc.com.cn'), 'http://www.detc.com.cn/');
  for (const value of ['javascript:alert(1)', 'data:text/html,hello', 'https://user:pass@example.com', '']) assert.equal(display.websiteHref(value), undefined);
});

test('switching dates aborts old reads and prevents stale data or errors from resurfacing', async () => {
  const p = polling();
  let resolve;
  let signal;
  const values = [];
  const stop = p.startWorkbenchPolling({ read: s => { signal = s; return new Promise(done => { resolve = done; }); }, onValue: value => values.push(value), onError: () => assert.fail(), onStopped: () => assert.fail() });
  stop();
  resolve({ sources: [] });
  await flush();
  assert.equal(signal.aborted, true);
  assert.equal(values.length, 0);
  assert.equal(p.scheduled(), false);
});

test('only unfinished sources poll, without overlapping requests; terminal errors stop', async () => {
  const p = polling();
  let release;
  let calls = 0;
  const stop = p.startWorkbenchPolling({ read: async () => { calls++; if (calls === 1) return { sources: [{ state: 'loading' }] }; return new Promise(done => { release = done; }); }, onValue: () => {}, onError: () => assert.fail(), onStopped: () => assert.fail() });
  await flush();
  assert.equal(p.scheduled(), true);
  const second = p.next();
  assert.equal(p.scheduled(), false);
  assert.equal(calls, 2);
  release({ sources: [{ state: 'error', message: 'unavailable' }] });
  await second;
  assert.equal(p.scheduled(), false);
  stop();
});

test('exhausted polling explicitly reports a stopped state instead of promising automatic updates', async () => {
  const p = polling();
  let stopped = 0;
  p.startWorkbenchPolling({ read: async () => ({ sources: [{ state: 'loading' }] }), onValue: () => {}, onError: () => assert.fail(), onStopped: () => { stopped++; } });
  await flush();
  for (let i = 0; i < 60; i++) await p.next();
  assert.equal(stopped, 1);
  assert.equal(p.scheduled(), false);
});

test('stale usable values refresh quietly, but failed refreshes are terminal', () => {
  const p = polling();
  assert.equal(p.sourcePending({ state: 'stale', message: null }), true);
  assert.equal(p.sourcePending({ state: 'stale', message: 'unavailable' }), false);
  assert.equal(p.sourcePending({ state: 'ready' }), false);
  assert.equal(p.sourcePending({ state: 'unpublished', message: '日程尚未发布' }), false);
});

test('original plan indexing polls slowly beyond the ordinary budget and stops when ready', async () => {
  const p = polling();
  let calls = 0;
  let stopped = 0;
  p.startWorkbenchPolling({ read: async () => ({ sources: [{ source: 'reduction_plans', state: ++calls <= 65 ? 'loading' : 'ready' }] }), onValue: () => {}, onError: () => assert.fail(), onStopped: () => { stopped++; } });
  await flush();
  for (let i = 0; i < 65; i++) await p.next();
  assert.equal(stopped, 0);
  assert.equal(calls, 66);
  assert.equal(p.scheduled(), false);
});
const riskDisplay = load('app/basic/components/risk-display.ts', { require: name => name === './workbench-polling' ? polling() : require(name) });
test('risk dates distinguish missing dates from status and normalize report periods', () => {
  assert.equal(riskDisplay.riskDate('20260630'), '2026-06-30');
  assert.equal(riskDisplay.riskDate('2026-09-30'), '2026-09-30');
  assert.equal(riskDisplay.riskDate(null), '—');
});
test('risk missing fields distinguish source failure, pending, stopped and no disclosed records', () => {
  const make = (state, message = null) => [{ source: 'balancesheet', state, message }];
  assert.equal(riskDisplay.riskMissing(make('error', 'unavailable'), 'balancesheet'), '暂时无法获取');
  assert.equal(riskDisplay.riskMissing(make('stale', 'unavailable'), 'balancesheet'), '暂时无法获取');
  assert.equal(riskDisplay.riskMissing(make('loading'), 'balancesheet'), '正在获取资料');
  assert.equal(riskDisplay.riskMissing(make('loading'), 'balancesheet', true), '资料尚未就绪');
  assert.equal(riskDisplay.riskMissing(make('ready'), 'balancesheet'), '暂无截至所选日已披露的资料');
});
test('risk title matches are review leads and missing evidence never claims no risk', () => {
  assert.equal(riskDisplay.riskCheckLabel({ state: 'leads', leads: 7 }), '7条待核实线索');
  assert.equal(riskDisplay.riskCheckLabel({ state: 'incomplete', leads: 0 }), '资料不完整');
  assert.equal(riskDisplay.riskCheckLabel({ state: 'no_matches', leads: 0 }), '未检索到相关线索');
});

test('platform reduction tags include announced upcoming plans, independently of the historical date', () => {
  const row = { type: '减持', recordKind: 'plan', reductionState: 'active', announcementDate: '2026-09-01', effectiveDate: '2026-09-02', endDate: '2026-09-30' };
  assert.equal(riskDisplay.currentReduction(row, '2026-09-30'), true);
  assert.equal(riskDisplay.currentReduction(row, '2026-10-01'), false);
  assert.equal(riskDisplay.currentReduction({ ...row, endDate: null }, '2026-09-30'), false);
  assert.equal(riskDisplay.currentReduction({ ...row, reductionState: 'ended' }, '2026-09-30'), false);
  assert.equal(riskDisplay.currentReduction({ ...row, announcementDate: '2026-10-01' }, '2026-09-30'), false);
  assert.equal(riskDisplay.currentReduction({ ...row, reductionDate: '2026-10-06' }, '2026-09-30'), false);
  const plan = { ...row, announcementDate: '2026-08-28', effectiveDate: '2026-09-21', endDate: '2026-12-20', reductionDate: '2026-10-06' };
  assert.equal(riskDisplay.currentReduction(plan, '2026-09-30'), true);
  assert.equal(riskDisplay.currentReduction({ ...plan, recordKind: undefined }, '2026-09-30'), false);
  assert.equal(riskDisplay.currentReduction({ ...plan, effectiveDate: '2026-10-07' }, '2026-09-30'), true);
  const upcoming = { ...plan, reductionState: 'upcoming', announcementDate: '2026-09-22', effectiveDate: '2026-10-21', endDate: '2027-01-20', reductionDate: '2026-10-19' };
  assert.equal(riskDisplay.currentReduction(upcoming, '2026-09-30'), true);
  assert.equal(riskDisplay.reductionRiskLabel(upcoming), '减持已公告，待开始：2026-10-21 至 2027-01-20');
  assert.equal(riskDisplay.currentReduction({ ...upcoming, effectiveDate: '2027-01-21' }, '2026-10-19'), false);
  assert.equal(riskDisplay.riskTypeLabel('减持'), '减持风险');
  assert.equal(riskDisplay.riskCheckLabel({ key: 'reduction', state: 'leads', activeCount: 1, leads: 9 }), '1项已公告减持风险');
  assert.equal(riskDisplay.riskCheckLabel({ key: 'reduction', state: 'leads', activeCount: 0, leads: 2 }), '2条计划公告待核实');
  assert.equal(riskDisplay.reductionStateLabel('superseded'), '已有后续披露');
});

test('risk row identities remain stable through filtering and distinguish record types and intervals', () => {
  const rows = [{ recordId: 'st-record', type: 'ST' }, { recordId: 'reduction-record', type: '减持' }];
  assert.equal(riskDisplay.riskRowKey(rows.filter(r => r.type === '减持')[0]), 'reduction-record');
  const row = { tsCode: '000001.SZ', type: '减持', effectiveDate: '2026-08-01', endDate: '2026-09-29' };
  assert.notEqual(riskDisplay.riskRowKey(row), riskDisplay.riskRowKey({ ...row, type: '停牌' }));
  assert.notEqual(riskDisplay.riskRowKey(row), riskDisplay.riskRowKey({ ...row, endDate: '2026-10-29' }));
});

const sourceDisplay = load('app/basic/components/source-display.ts');

test('one failed source does not hide successful sources, including empty successful responses', () => {
  const rows = sourceDisplay.sourceStatusRows([
    { source: 'fina_indicator', state: 'ready' },
    { source: 'stock_st', state: 'ready' },
    { source: 'reduction_plans', state: 'error', message: '连接失败' },
  ]);
  assert.equal(rows[0].status, '已获取');
  assert.equal(rows[0].color, 'green');
  assert.equal(rows[1].complete, true);
  assert.equal(rows[2].status, '获取失败');
  assert.equal(rows[2].available, false);
});

test('source status preserves partial batches and distinguishes a failed update with cached data', () => {
  const rows = sourceDisplay.sourceStatusRows([
    { source: 'eastmoney_ann', state: 'ready' },
    { source: 'eastmoney_ann', state: 'error', message: '连接失败' },
    { source: 'reduction_plans', state: 'stale', message: '连接失败', fetchedAt: '2026-10-07T05:00:00Z', nextRetryAt: '2026-10-07T06:00:00Z' },
  ]);
  assert.equal(rows[0].status, '部分已获取，部分获取失败');
  assert.equal(rows[0].available, true);
  assert.equal(rows[0].complete, false);
  assert.equal(rows[1].status, '更新失败，保留已获取资料');
  assert.equal(rows[1].nextRetryAt, '2026-10-07T06:00:00Z');
  assert.equal(sourceDisplay.sourceStatusRows([{ source: 'stock_st', state: 'loading' }], true)[0].status, '尚未就绪');
});

test('risk sections use only their own dependencies and unknown counts never masquerade as zero', () => {
  const sources = riskDisplay.riskEventSources.map(source => ({ source, state: 'ready' }));
  sources.push({ source: 'reduction_plans', state: 'error' }, { source: 'fina_indicator', state: 'error' });
  assert.equal(riskDisplay.riskSourcesReady(sources, riskDisplay.riskEventSources), true);
  assert.equal(riskDisplay.riskSourcesReady(sources, ['reduction_plans']), false);
  assert.equal(riskDisplay.riskSourcesReady(sources.slice(1), riskDisplay.riskEventSources), false);
  assert.equal(riskDisplay.riskSourcesReady([...sources, { source: 'stock_st', state: 'error' }], riskDisplay.riskEventSources), false);
  assert.equal(riskDisplay.riskSectionTitle('已公告减持风险', 0, '项', false), '已公告减持风险（资料待补全）');
  assert.equal(riskDisplay.riskSectionTitle('当前减持计划', 2, '项', false), '当前减持计划（已获取2项，资料待补全）');
  assert.equal(riskDisplay.riskSectionTitle('其他状态与事件', 0, '条', true), '其他状态与事件（0条）');
});

test('unknown reduction plans affect only the stock concerned, including older server responses', () => {
  const data = { reductionCoverage: { unknown: 2, unknownCodes: ['000001.SZ'] } };
  assert.equal(riskDisplay.stockReductionUnknown(data, '000001.SZ'), true);
  assert.equal(riskDisplay.stockReductionUnknown(data, '000090.SZ'), false);
  assert.equal(riskDisplay.stockReductionUnknown({ reductionCoverage: { unknown: 2 } }, '000090.SZ'), false);
  assert.equal(riskDisplay.stockReductionUnknown({ code: '000090.SZ', reductionCoverage: { unknown: 2 } }, '000090.SZ'), true);
});

test('risk UI renders successful sources and cached records when reduction refresh fails', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const interaction = { __esModule: true, default: 'a', ExternalLink: 'a', InteractionButton: 'button' };
  const stockActions = { StockLink: ({ code, name }) => React.createElement('button', null, name || code) };
  const workbench = load('app/basic/components/workbench.tsx', { require: name => {
    if (name === '@/components/StockActions') return stockActions;
    if (name === './risk-display') return riskDisplay;
    if (name === './source-display') return sourceDisplay;
    if (name === './workbench-polling') return polling();
    if (name === './workbench.css') return {};
    if (name === '@/components/Interaction') return interaction;
    if (name === '@/auth/Boundary') return { useAccount: () => ({ user: {} }) };
    if (name === '@/auth/client') return { allowedPath: () => false };
    if (name.startsWith('@/')) return {};
    return require(name);
  } });
  const data = {
    code: '000090.SZ', name: '天健集团', date: '2026-09-30', reductionDate: '2026-10-07',
    sources: [
      ...riskDisplay.riskEventSources.map(source => ({ source, state: 'ready' })),
      ...['fina_indicator', 'balancesheet', 'fina_audit', 'eastmoney_ann'].map(source => ({ source, state: 'ready' })),
      { source: 'reduction_plans', state: 'stale', message: '连接失败', fetchedAt: '2026-10-07T05:00:00Z' },
    ],
    items: [], reductionCoverage: { unknown: 1, unknownCodes: ['000001.SZ'] },
    financial: { profit_dedt: -356036909.75, end_date: '20260630', ann_date: '20260822' },
  };
  const statusHtml = renderToStaticMarkup(React.createElement(workbench.SourceState, { data, retry: () => {} }));
  assert.match(statusHtml, /财务指标：已获取/);
  assert.match(statusHtml, /公司公告：已获取/);
  assert.match(statusHtml, /减持计划：更新失败，保留已获取资料/);
  assert.match(statusHtml, /查看资料获取时间/);
  const tags = renderToStaticMarkup(React.createElement(workbench.RiskTags, { data, code: data.code }));
  assert.doesNotMatch(tags, /资料尚不完整|该股减持计划期间待核实/);
  const details = load('app/basic/components/RiskInspect.tsx', { require: name => {
    if (name === '@/components/StockActions') return stockActions;
    if (name === './workbench') return { ...workbench, useWorkbench: () => ({ data, retry: () => {}, loading: false }) };
    if (name === './risk-display') return riskDisplay;
    if (name === '@/components/Interaction') return interaction;
    if (name === '@/components/DataTable') return { __esModule: true, default: () => null };
    if (name === '@/utils/format') return { scaledNumber: value => (value / 1e8).toFixed(2) };
    return require(name);
  } });
  let html = renderToStaticMarkup(React.createElement(details.RiskDetails, { code: data.code, date: data.date }));
  assert.match(html, /-3.56 亿元/);
  assert.match(html, /其他状态与事件（0条）/);
  assert.match(html, /资料已获取，暂无其他状态或事件记录/);
  assert.match(html, /已公告减持风险（资料待补全）/);
  assert.doesNotMatch(html, /已公告减持风险（0项）|状态资料尚未完整取得/);
  data.items.push({ type: '减持', tsCode: data.code, recordId: 'cached-plan', recordKind: 'plan', reductionState: 'active', reductionDate: data.reductionDate, announcementDate: '2026-09-01', effectiveDate: '2026-09-21', endDate: '2026-12-20', detail: '已获取的减持计划内容' });
  html = renderToStaticMarkup(React.createElement(details.RiskDetails, { code: data.code, date: data.date }));
  assert.match(html, /已获取的减持计划内容/);
  assert.match(html, /已公告减持风险（已获取1项，资料待补全）/);
});
test('source timestamps group batches and show their full range in Beijing time', () => {
  const rows = sourceDisplay.sourceTimeRows([
    { source: 'stock_st', fetchedAt: '2026-10-05T16:00:00Z' },
    ...Array.from({ length: 6 }, (_, i) => ({ source: 'stk_holdertrade', fetchedAt: `2026-10-06T05:36:${30 + i}Z` })),
    { source: 'anns_d', fetchedAt: '2026-10-06T13:00:00+08:00' },
    { source: 'eastmoney_ann', fetchedAt: '2026-10-06T05:00:00Z' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].time, '2026-10-06 00:00:00');
  assert.equal(rows[1].label, '股东减持');
  assert.equal(rows[1].time, '2026-10-06 13:36:30 至 2026-10-06 13:36:35');
  assert.equal(rows[2].label, '公司公告');
  assert.equal(rows[2].time, '2026-10-06 13:00:00');
});
test('source timestamps keep missing or invalid batch times explicit and hide internal names', () => {
  const rows = sourceDisplay.sourceTimeRows([
    { source: 'stk_holdertrade', fetchedAt: '2026-10-06T05:36:30Z' },
    { source: 'stk_holdertrade', fetchedAt: null },
    { source: 'stock_company', fetchedAt: 'invalid' },
    { source: 'internal_source_a' }, { source: 'internal_source_b' },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].time, '2026-10-06 13:36:30（部分获取时间缺失）');
  assert.equal(rows[1].time, '尚未取得获取时间');
  assert.equal(rows[2].label, '其他资料');
  assert(!JSON.stringify(rows).includes('internal_source'));
  assert.equal(sourceDisplay.sourceTimeRows([]).length, 0);
});
