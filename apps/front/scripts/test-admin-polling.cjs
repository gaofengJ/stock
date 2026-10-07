const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/admin/sync/job-polling.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const fixture = () => {
  let callback;
  const sandbox = { exports: {}, setTimeout: fn => { callback = fn; return 1; }, clearTimeout: () => { callback = undefined; } };
  vm.runInNewContext(code, sandbox);
  return { start: sandbox.exports.startJobPolling, next: () => { const fn = callback; callback = undefined; return fn?.(); }, scheduled: () => !!callback };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

test('historical failure follows its successor until recovery annotations are final', async () => {
  const f = fixture();
  const values = [];
  let calls = 0;
  f.start({ read: async () => ({ status: 'failed', handling: ++calls === 1 ? 'continued' : 'recovered' }), onValue: v => values.push(v.handling), onError: () => assert.fail(), visible: () => true });
  await flush();
  assert.equal(f.scheduled(), true);
  await f.next();
  assert.deepEqual(values, ['continued', 'recovered']);
  assert.equal(f.scheduled(), false);
});

test('late task A cannot overwrite task B after switching or closing the drawer', async () => {
  const { start } = fixture();
  const values = [];
  let resolveA;
  const stopA = start({ read: () => new Promise(resolve => { resolveA = resolve; }), onValue: v => values.push(v.id), onError: () => assert.fail(), visible: () => true });
  stopA();
  const stopB = start({ read: async () => ({ id: 'B', status: 'success' }), onValue: v => values.push(v.id), onError: () => assert.fail(), visible: () => true });
  await flush();
  resolveA({ id: 'A', status: 'running' });
  await flush();
  assert.deepEqual(values, ['B']);
  stopB();
});
test('discarded errors do not appear on a different task', async () => {
  const { start } = fixture();
  let reject;
  const stop = start({ read: () => new Promise((_, failure) => { reject = failure; }), onValue: () => assert.fail(), onError: () => assert.fail(), visible: () => true });
  stop();
  reject(new Error('stale error'));
  await flush();
});
test('terminal tasks stop polling, hidden pages defer reads, requests never overlap', async () => {
  const f = fixture();
  let visible = false;
  let calls = 0;
  let release;
  const stop = f.start({ read: () => { calls += 1; return new Promise(resolve => { release = resolve; }); }, onValue: () => {}, onError: () => assert.fail(), visible: () => visible });
  assert.equal(calls, 0);
  visible = true;
  const pending = f.next();
  assert.equal(calls, 1);
  assert.equal(f.scheduled(), false, 'No next poll is scheduled until the current request finishes');
  release({ status: 'paused' });
  await pending;
  stop();
  const terminal = fixture();
  terminal.start({ read: async () => ({ status: 'cancelled' }), onValue: () => {}, onError: () => assert.fail(), visible: () => true });
  await flush();
  assert.equal(terminal.scheduled(), false);
});
