const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { createRequire } = require('node:module');
test('application dates work with the installed Ant Design picker adapter', () => {
  const dayjs = require('dayjs');
  const antdRequire = createRequire(require.resolve('antd/package.json'));
  const adapter = antdRequire('rc-picker/lib/generate/dayjs').default;
  const value = dayjs('2026-10-23');
  assert.equal(adapter.getWeekDay(value), 5);
  assert.equal(adapter.locale.getWeek('zh_CN', value), 43);
  assert.equal(adapter.locale.format('zh_CN', value, 'YYYY-MM-DD'), '2026-10-23');
});
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

const focusSandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/basic/trade-cal/investment-focus.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, focusSandbox);
const { isAShareFocusEvent } = focusSandbox.exports;
test('A-share focus keeps key domestic, global policy and sector events instead of all highly rated foreign data', () => {
  for (const event of [
    { source: 'cn_schedule', title: '中国制造业PMI' },
    { source: 'eco_cal', country: '美国', title: '核心CPI年率' },
    { source: 'eco_cal', country: '美国', title: '非农就业人口' },
    { source: 'eco_cal', country: '美国', title: '美联储利率决议' },
    { source: 'eco_cal', country: '欧元区', title: '欧洲央行利率决定' },
    { source: 'eco_cal', country: '美国', title: '美联储缩减资产负债表计划' },
    { source: 'investment_calendar', title: '全国两会召开' },
    { source: 'investment_calendar', title: '中国共产党第二十届中央委员会第四次全体会议' },
    { source: 'investment_calendar', title: 'CES国际消费电子展' },
    { source: 'investment_calendar', title: 'ESMO欧洲肿瘤内科学会大会' },
    { source: 'investment_calendar', title: '产业价格调整', sectors: ['储能'] },
    { source: 'investment_calendar', title: '关税调整政策发布' },
  ]) assert.equal(isAShareFocusEvent(event), true, JSON.stringify(event));
  for (const event of [
    { source: 'eco_cal', country: '美国', title: '美国联邦储备银行储备金余额', importance: 3 },
    { source: 'eco_cal', country: '美国', title: '美联储资产负债表', importance: 3 },
    { source: 'eco_cal', country: '澳大利亚', title: '制造业和服务业PMI(十月)', importance: 3 },
    { source: 'eco_cal', country: '德国', title: '制造业PMI', importance: 3 },
    { source: 'eco_cal', country: '英国', title: '住房贷款许可' },
    { source: 'investment_calendar', title: '电影首映定档', sectors: ['影视'] },
    { source: 'investment_calendar', title: '某地文化论坛举行' },
    { source: 'investment_calendar', title: ' ' },
  ]) assert.equal(isAShareFocusEvent(event), false, JSON.stringify(event));
});


// Exercise the actual request hook with controlled responses and committed effects.
function workbenchHook() {
  const states = [], effects = [], queued = [], requests = [];
  let cursor = 0, dirty = false;
  const react = {
    useState(initial) {
      const i = cursor++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { const next = typeof value === 'function' ? value(states[i]) : value; if (!Object.is(next, states[i])) { states[i] = next; dirty = true; } }];
    },
    useEffect(create, deps) {
      const i = cursor++, old = effects[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        effects[i] = { deps, cleanup: old?.cleanup };
        queued.push(() => { effects[i].cleanup?.(); effects[i].cleanup = create(); });
      }
    },
  };
  const pollingSource = fs.readFileSync(path.join(__dirname, '../src/app/basic/components/workbench-polling.ts'), 'utf8');
  const pollingSandbox = { exports: {}, AbortController, setTimeout: () => 1, clearTimeout: () => {} };
  vm.runInNewContext(ts.transpileModule(pollingSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, pollingSandbox);
  const hookSandbox = { exports: {}, require: name => {
    if (name === 'react') return react;
    if (name === '@/api/request') return { get: (url, { signal }) => new Promise((resolve, reject) => requests.push({ url, signal, resolve: data => resolve({ data }), reject })) };
    if (name === '@/api/errors') return { errorMessage: e => e.message };
    if (name === './workbench-polling') return pollingSandbox.exports;
    return {};
  } };
  const source = fs.readFileSync(path.join(__dirname, '../src/app/basic/components/workbench.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, hookSandbox);
  return {
    requests,
    render(params, scope, commit = true) {
      for (let pass = 0; pass < 20; pass++) {
        cursor = 0; dirty = false;
        const value = hookSandbox.exports.useWorkbench('events', params, true, scope);
        if (!commit) return value;
        while (queued.length) queued.shift()();
        if (!dirty) return value;
      }
      assert.fail('Request state did not settle');
    },
  };
}
const flushRequest = () => new Promise(resolve => setImmediate(resolve));

test('pending-source notice survives page-size changes and breaks the resize/request feedback loop', async () => {
  const h = workbenchHook(), scope = '2026-04-04:7:all';
  const params = { date: '2026-04-04', page: '1', pageSize: '3' };
  h.render(params, scope);
  const data = { items: [{ name: 'sample' }], sources: [{ source: 'share_float', state: 'loading' }] };
  h.requests[0].resolve(data); await flushRequest();
  let value = h.render(params, scope);
  const rows = v => Math.floor((680 - (v.data?.sources ? 370 : 280) - 150) / 64);
  assert.equal(rows(value), 2);
  const resized = { ...params, pageSize: '2' };
  value = h.render(resized, scope, false);
  assert.equal(value.data, data, 'Notice must remain even before the replacement effect commits');
  assert.equal(value.loading, true);
  value = h.render(resized, scope);
  assert.equal(rows(value), 2, 'Loading must not move the anchor back to three rows');
  h.requests[1].resolve(data); await flushRequest();
  value = h.render(resized, scope);
  assert.equal(value.loading, false); assert.equal(rows(value), 2);
  for (let i = 0; i < 5; i++) h.render(resized, scope);
  assert.equal(h.requests.length, 2);
});

test('page navigation retains notices while new dates clear results and cancel old responses', async () => {
  const h = workbenchHook(), scope = '2026-04-04';
  const params = { date: '2026-04-04', page: '1', pageSize: '2' };
  h.render(params, scope);
  const data = { items: ['old'], sources: [{ state: 'ready' }] };
  h.requests[0].resolve(data); await flushRequest(); h.render(params, scope);
  const page = { ...params, page: '2' };
  assert.equal(h.render(page, scope).data, data);
  const changed = { ...params, date: '2026-04-05' };
  assert.equal(h.render(changed, '2026-04-05', false).data, null);
  h.render(changed, '2026-04-05'); assert.equal(h.requests[1].signal.aborted, true);
  h.requests[1].resolve(data); await flushRequest();
  assert.equal(h.render(changed, '2026-04-05').data, null);
  const current = { items: ['current'], sources: [{ state: 'ready' }] };
  h.requests[2].resolve(current); await flushRequest();
  assert.equal(h.render(changed, '2026-04-05').data, current);
});


test('request failure notices remain stable through automatic resizing and clear after recovery', async () => {
  const h = workbenchHook(), params = { date: '2026-04-04', pageSize: '3' }, scope = '2026-04-04';
  h.render(params, scope); h.requests[0].reject(new Error('暂时无法获取')); await flushRequest();
  assert.equal(h.render(params, scope).error, '暂时无法获取');
  const resized = { ...params, pageSize: '2' };
  assert.equal(h.render(resized, scope, false).error, '暂时无法获取');
  assert.equal(h.render(resized, scope).error, '暂时无法获取');
  h.requests[1].resolve({ items: [], sources: [] }); await flushRequest();
  assert.equal(h.render(resized, scope).error, '');
});


test('callers without an explicit data scope continue to isolate results by the full request', async () => {
  const h = workbenchHook(), params = { date: '2026-04-04', page: '1' };
  h.render(params); h.requests[0].resolve({ items: ['old'], sources: [] }); await flushRequest();
  assert.ok(h.render(params).data);
  assert.equal(h.render({ ...params, page: '2' }, undefined, false).data, null);
});
