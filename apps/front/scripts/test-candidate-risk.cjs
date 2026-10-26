const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');

function setup() {
  const slots = [], effects = [], calls = [], polls = [];
  let index = 0;
  const hooks = {
    useRef(value) { const i = index++; return slots[i] ||= { current: value }; },
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = value; return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useCallback(fn) { index++; return fn; },
    useEffect(fn, deps) { const i = index++; if (!slots[i] || deps.some((d, k) => d !== slots[i].deps[k])) { slots[i]?.cleanup?.(); effects.push(() => { slots[i] = { deps, cleanup: fn() }; }); } },
  };
  const imports = {
    react: hooks,
    antd: { Button: 'button', Collapse: 'collapse', Tag: 'tag' },
    '@/api/request': { __esModule: true, default: { get: async (url, config) => {
      calls.push(config.params);
      return { data: { items: config.params.codes.split(',').map((tsCode) => ({ tsCode, tags: [{ label: '诉讼仲裁线索' }], sources: [{ source: 'eastmoney_ann', state: 'ready' }, { source: 'pledge_stat', state: 'error' }] })), sources: [] } };
    } } },
    '@/components/Interaction': { ExternalLink: 'a' },
    '../basic/components/RiskInspect': { __esModule: true, default: 'risk-inspect' },
    '../basic/components/workbench': { SourceState: 'source-state' },
    '../basic/components/risk-display': { currentReduction: () => true, reductionRiskLabel: () => '减持进行中', riskTypeLabel: (type) => type },
    '../basic/components/workbench-polling': { sourcePending: (s) => s.state === 'loading', startWorkbenchPolling: (options) => { const controller = new AbortController(); polls.push({ ...options, controller }); return () => controller.abort(); } },
    './candidate-risk.css': {},
  };
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/app/strategy/CandidateRisk.tsx`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'exports', code)((name) => Object.hasOwn(imports, name) ? imports[name] : require(name), exports);
  const render = (fn) => { index = 0; const value = fn(); effects.splice(0).forEach((effect) => effect()); return value; };
  return { exports, render, calls, polls, cleanup: () => slots.forEach((slot) => slot?.cleanup?.()) };
}

test('only visible rows enqueue, batches cap at 20, partial success is cached, date changes isolate requests', async () => {
  const h = setup();
  const render = (date = '2026-09-30', enabled = true) => h.render(() => h.exports.useCandidateRisks(date, enabled));
  const initial = render();
  assert.equal(h.polls.length, 0);
  for (let i = 0; i < 21; i++) initial.watch(`${String(i).padStart(6, '0')}.SZ`, true);
  await new Promise((r) => setTimeout(r, 120));
  render();
  const poll = h.polls[0];
  poll.onValue(await poll.read(poll.controller.signal));
  assert.deepEqual(h.calls.map((call) => call.codes.split(',').length), [20, 1]);
  assert.equal(render().rows.size, 21);
  initial.watch('000000.SZ', false);
  await new Promise((r) => setTimeout(r, 120));
  render();
  assert.equal(h.polls.length, 1, 'ready/error cached results do not refetch when scrolling');
  assert.equal(poll.controller.signal.aborted, true);
  render('2026-09-29');
  assert.equal(h.polls.length, 2);
  render('2026-09-29', false);
  assert.equal(h.polls[1].controller.signal.aborted, true);
  h.cleanup();
});

test('successful labels survive another source failure and evidence is only a lazy modal child', () => {
  const h = setup();
  global.IntersectionObserver = class { observe() {} disconnect() {} };
  const tree = h.render(() => h.exports.default({ code: '000001.SZ', name: '测试', date: '2026-09-30', base: { items: [{ tsCode: '000001.SZ', type: '停牌' }], sources: [{ state: 'ready' }] }, state: { watch() {}, failed: false, rows: new Map([['000001.SZ', { tags: [{ label: '诉讼仲裁线索' }], sources: [{ state: 'ready' }, { state: 'error' }] }]]) } }));
  const modal = tree.props.children;
  const text = (value) => typeof value === 'string' ? value : React.Children.toArray(value?.props?.children).map(text).join(' ');
  assert.match(text(modal.props.trigger), /停牌/);
  assert.match(text(modal.props.trigger), /诉讼仲裁线索/);
  assert.match(text(modal.props.trigger), /部分资料待核验/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.polls.length, 0);
  h.cleanup();
  delete global.IntersectionObserver;
});
