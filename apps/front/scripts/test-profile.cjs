const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

function load(file, extra = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const sandbox = { exports: {}, require, URL, URLSearchParams, AbortController, ...extra };
  vm.runInNewContext(code, sandbox);
  return sandbox.exports;
}
const display = load('app/basic/stock/detail/profile-display.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
function polling() {
  let timer;
  const api = load('app/basic/components/workbench-polling.ts', { setTimeout: fn => { timer = fn; return 1; }, clearTimeout: () => { timer = undefined; } });
  return { ...api, next: () => { const fn = timer; timer = undefined; return fn?.(); }, scheduled: () => !!timer };
}

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
});
