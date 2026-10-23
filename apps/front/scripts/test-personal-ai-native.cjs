const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
let account = null;
const root = path.join(__dirname, '../src');
const modules = new Map();
function load(name) {
  let file = path.resolve(root, name);
  if (!path.extname(file)) file = fs.existsSync(file + '.tsx') ? file + '.tsx' : fs.existsSync(file + '.ts') ? file + '.ts' : path.join(file, 'index.tsx');
  if (modules.has(file)) return modules.get(file);
  const exp = {}; modules.set(file, exp);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('exports', 'require', output)(exp, key => {
    if (key.endsWith('.css')) return {};
    if (key === '@/auth/Boundary') return { useAccount: () => ({ user: account }) };
    if (key === '@/api/errors') return { readApiResponse: response => response.json(), userError: error => error };
    if (key.startsWith('@/')) return load(key.slice(2));
    if (key.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), key)));
    return require(key);
  });
  return exp;
}
const owner = { id: 1, username: 'mufeng', roles: [{ code: 'admin' }], permissions: [], catalog: [], mustChangePassword: false };

test('business entry is absent for non-owner accounts and uses four-character business names', () => {
  const Action = load('components/PersonalAi/BusinessAction').default;
  for (const user of [null, { ...owner, id: 2 }, { ...owner, guest: true }, { ...owner, roles: [] }]) {
    account = user;
    assert.equal(renderToStaticMarkup(React.createElement(Action, { skill: 'market-review', date: '2026-10-16' })), '');
  }
  account = owner;
  const review = renderToStaticMarkup(React.createElement(Action, { skill: 'market-review', date: '2026-10-16' }));
  const compare = renderToStaticMarkup(React.createElement(Action, { skill: 'candidate-compare', date: '2026-10-16' }));
  assert.match(review, /智能复盘/); assert.match(compare, /智能对比/);
  assert.match(review, /在侧栏输入问题后开始分析/);
  assert.match(compare, /在侧栏选择1至3只股票后开始分析/);
  const waiting = renderToStaticMarkup(React.createElement(Action, { skill: 'candidate-compare', date: '2026-10-16', disabled: true, disabledReason: '候选数据加载中' }));
  assert.match(waiting, /候选数据加载中/);
  assert.match(waiting, /disabled=""/);
  assert.doesNotMatch(review + compare, /<iframe/);
});

test('analysis panel is native, begins with Sol High, and opening its render never sends a task', () => {
  const Panel = load('components/PersonalAi/AnalysisPanel').default;
  const html = renderToStaticMarkup(React.createElement(Panel, { ownerId: 1, skill: 'candidate-compare', date: '2026-10-16', candidates: [{ code: '600519.SH', name: '示例股票' }] }));
  assert.match(html, /2026-10-16/); assert.match(html, /GPT-6.1 Sol/); assert.match(html, /high/);
  assert.match(html, /对比股票/); assert.match(html, /尚未发起分析/); assert.doesNotMatch(html, /<iframe/);
});

test('model preferences are account-scoped and unknown choices fall back to Sol High', () => {
  const client = load('components/PersonalAi/client');
  const storage = new Map();
  global.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  try {
    client.saveChoice(1, { model: 'gpt-6-astra', effort: 'high' });
    assert.equal(client.readChoice(1).model, 'gpt-6-astra');
    assert.deepEqual(client.readChoice(2), client.defaultChoice);
    storage.set('personal-ai-model:1', JSON.stringify({ model: 'unknown', effort: 'high' }));
    assert.deepEqual(client.readChoice(1), client.defaultChoice);
    assert.equal(client.supportsChoice({ models: [{ model: 'gpt-6.1-sol', efforts: ['high'] }] }, { model: 'gpt-6-astra', effort: 'high' }), false);
  } finally { delete global.localStorage; }
});

test('status queries use the existing same-origin session without submitting a model task', async () => {
  const client = load('components/PersonalAi/client'), original = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ enabled: true }) }; };
  try {
    await client.consoleRequest('/status');
    assert.equal(calls.length, 1); assert.equal(calls[0].url, '/personal-ai/api/status');
    assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.credentials, 'same-origin');
    assert.equal(calls[0].options.body, undefined);
  } finally { global.fetch = original; }
});


test('result formatting renders tables and emphasis but never creates executable HTML or remote resources', () => {
  const Result = load('components/PersonalAi/ResultText').default;
  const html = renderToStaticMarkup(React.createElement(Result, { text: '## 对比\n| 股票 | 结论 |\n|---|---|\n| 测试 | **观察** |\n<script>alert(1)</script>\n<img src="https://evil.test/x">\n[点击](javascript:alert(1))' }));
  assert.match(html, /<table>/); assert.match(html, /<strong>观察<\/strong>/);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script|<img|<a /);
});

test('both business panels expose no-inference data checking', () => {
  const Panel=load('components/PersonalAi/AnalysisPanel').default;
  for(const skill of ['market-review','candidate-compare']) {
    const html=renderToStaticMarkup(React.createElement(Panel,{ownerId:1,skill,date:'2026-10-16'}));
    assert.match(html,/检查分析数据/);assert.match(html,/尚未发起分析/);
  }
});

test('task history groups followups and strategy conditions use readable names', () => {
 const {taskGroups,strategyCaption}=load('components/PersonalAi/client');
 const tasks=[{id:'b',parentId:'a'},{id:'c'},{id:'a'}];
 assert.deepEqual(taskGroups(tasks).map(group=>group.map(t=>t.id)),[['b','a'],['c']]);
 assert.match(strategyCaption({type:'fiveMaUp',parameters:{fiveMaMode:'new',aboveMa5:false,volumeDays:5}}),/五线顺上；五线状态：当日新形成，收盘高于5日线：否，均量天数：5/);
});
test('an already cancelled analysis request cannot acquire credentials or post a task', async () => {
 const {consoleRequest}=load('components/PersonalAi/client');const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;throw Error('must not send');};
 try {const abort=new AbortController();abort.abort();await assert.rejects(consoleRequest('/tasks','POST',{},abort.signal));assert.equal(calls,0);} finally {global.fetch=original;}
});
