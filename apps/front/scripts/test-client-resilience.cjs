const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relative, mocks = {}) {
  const file = path.resolve(__dirname, relative); const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('exports', 'require', code)(exports, name => {
    if (name in mocks) return mocks[name];
    if (name.startsWith('@/')) return load(`../src/${name.slice(2)}.ts`, mocks);
    if (name.startsWith('.')) return load(path.relative(__dirname, path.resolve(path.dirname(file), `${name}.ts`)), mocks);
    return require(name);
  });
  return exports;
}
const deadline = load('../src/auth/request-deadline.ts');
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('deadline covers response-body parsing and cancels the transport', async () => {
  let signal;
  const body = deferred();
  const result = deadline.withRequestDeadline(async s => { signal = s; return body.promise; }, { timeout: 10 });
  await assert.rejects(result, /超时/);
  assert.equal(signal.aborted, true);
  body.resolve('late');
});

test('an already aborted request never starts; a live abort cancels waiting work', async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await assert.rejects(deadline.withRequestDeadline(async () => { calls++; }, { signal: controller.signal }));
  assert.equal(calls, 0);
  const next = new AbortController();
  const waiting = deadline.withRequestDeadline(() => new Promise(() => {}), { signal: next.signal });
  next.abort(); await assert.rejects(waiting, { name: 'AbortError' });
});

test('API timeout includes CSRF, shared initialization survives one caller cancellation', async () => {
  const original = global.fetch; const csrf = deferred(); const writes = [];
  global.fetch = async (url, options) => {
    if (url.endsWith('/csrf')) return csrf.promise;
    writes.push(options);
    return { ok: true, json: async () => ({ code: 0, data: { saved: true } }) };
  };
  try {
    const auth = load('../src/auth/client.ts');
    const first = auth.api('/users/me', 'PATCH', {}, false, { timeout: 10 });
    const second = auth.api('/users/me', 'PATCH', {}, false, { timeout: 1000 });
    await assert.rejects(first, /超时/);
    assert.equal(writes.length, 0);
    csrf.resolve({ ok: true, json: async () => ({ code: 0, data: { csrfToken: 'test-only' } }) });
    assert.deepEqual(await second, { saved: true });
    assert.equal(writes.length, 1);
  } finally { global.fetch = original; }
});

test('API times out stalled body and preserves explicit authentication status', async () => {
  const original = global.fetch; const body = deferred();
  try {
    const auth = load('../src/auth/client.ts');
    global.fetch = async () => ({ ok: true, json: () => body.promise });
    await assert.rejects(auth.api('/news', 'GET', undefined, false, { timeout: 10 }), /超时/);
    body.resolve({ code: 0, data: [] });
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: '登录已失效' }) });
    await assert.rejects(auth.api('/auth/access', 'GET', undefined, false), error => error.status === 401);
  } finally { global.fetch = original; }
});

test('financial cache reuses overlap but refreshes pending, failed, expired and explicit retries', () => {
  const { createProfitCache } = load('../src/app/strategy/candidate-profit-cache.ts');
  const row = (tsCode, sourceState = 'ready') => ({ tsCode, sourceState, forecastState: 'ready' });
  const cache = createProfitCache();
  cache.write('2026-10-12', [row('000001.SZ'), row('000002.SZ', 'loading'), row('000003.SZ', 'error')]);
  const selected = cache.read('2026-10-12', ['000001.SZ', '000002.SZ', '000003.SZ', '000004.SZ']);
  assert.deepEqual(selected.pending, ['000002.SZ', '000003.SZ', '000004.SZ']);
  assert.equal(selected.rows.size, 3);
  assert.deepEqual(cache.read('2026-10-12', ['000001.SZ']).pending, []);
  assert.deepEqual(cache.read('2026-10-11', ['000001.SZ']).pending, ['000001.SZ']);
  assert.deepEqual(cache.read('2026-10-12', ['000001.SZ'], true).pending, ['000001.SZ']);
  const expired = createProfitCache(-1); expired.write('2026-10-12', [row('000001.SZ')]);
  assert.deepEqual(expired.read('2026-10-12', ['000001.SZ']).pending, ['000001.SZ']);
  const bounded = createProfitCache(120000, 1); bounded.write('2026-10-12', [row('000001.SZ'), row('000002.SZ')]);
  assert.deepEqual(bounded.read('2026-10-12', ['000001.SZ', '000002.SZ']).pending, ['000001.SZ']);
});

test('candidate notes beyond the old limit survive handoff; the new limit fails explicitly', () => {
  const { emptyNotebook } = load('../src/app/review/notebook-model.ts');
  const { reviewPacket } = load('../src/app/review/article-handoff.ts');
  const { TOOL_EVIDENCE_LIMIT, toolEvidenceError } = load('../src/app/review/notebook-limits.ts');
  const content = emptyNotebook(); content.private.toolEvidence = '完整候选原文'.repeat(10000);
  assert.equal(reviewPacket('2026-10-12', 1, content).userNotes.find(row => row.key === 'toolEvidence').text, content.private.toolEvidence);
  content.private.toolEvidence = '字'.repeat(TOOL_EVIDENCE_LIMIT + 1);
  assert.match(toolEvidenceError(content.private.toolEvidence), /原文已完整保留/);
  assert.throws(() => reviewPacket('2026-10-12', 1, content), /超过/);
  assert.equal(content.private.toolEvidence.length, TOOL_EVIDENCE_LIMIT + 1);
});

test('missing analysis data stays null, genuine zero stays visible, and totals never invent zero', () => {
  const { analysisAmount, hasAnalysisValues, distributionTotals } = load('../src/app/analysis/components/legacy-series.ts');
  assert.equal(analysisAmount(null), null);
  assert.equal(analysisAmount(0), 0);
  assert.equal(analysisAmount(100000000), 1);
  assert.equal(hasAnalysisValues([{ tradeDate: '2026-10-12', state: 'missing', count: null }]), false);
  assert.equal(hasAnalysisValues([{ tradeDate: '2026-10-12', state: 'ready', count: 0 }]), true);
  const rows = Array.from({ length: 21 }, () => ({ count: 0, state: 'ready' }));
  assert.deepEqual(distributionTotals(rows), { countPositive: 0, countZero: 0, countNegative: 0 });
  rows[0] = { count: null, state: 'missing' };
  assert.deepEqual(distributionTotals(rows), { countPositive: null, countZero: null, countNegative: null });
});

test('notebook save counts serialized content and UTF-8 request bytes without truncation', () => {
  const { notebookPayload, NOTEBOOK_CONTENT_LIMIT, NOTEBOOK_REQUEST_LIMIT } = load('../src/app/review/notebook-limits.ts');
  const content = { private: { toolEvidence: '完整原文' }, article: { body: '长文'.repeat(100000) } };
  const payload = notebookPayload('2026-10-12', 2, 3, content);
  assert.deepEqual(JSON.parse(payload.content), content);
  assert.equal(payload.generation, 3);
  const overCharacters = { private: {}, text: 'a'.repeat(NOTEBOOK_CONTENT_LIMIT) };
  assert.throws(() => notebookPayload('2026-10-12', 1, 0, overCharacters), /6500000 字符/);
  assert.equal(overCharacters.text.length, NOTEBOOK_CONTENT_LIMIT);
  const overBytes = { private: {}, text: '字'.repeat(Math.ceil(NOTEBOOK_REQUEST_LIMIT / 3)) };
  assert.ok(JSON.stringify(overBytes).length < NOTEBOOK_CONTENT_LIMIT);
  assert.throws(() => notebookPayload('2026-10-12', 1, 0, overBytes), /8 MiB/);
  const escapeExpansion = { private: {}, text: '"'.repeat(2200000) };
  assert.ok(JSON.stringify(escapeExpansion).length < NOTEBOOK_CONTENT_LIMIT);
  assert.throws(() => notebookPayload('2026-10-12', 1, 0, escapeExpansion), /8 MiB/);
});
