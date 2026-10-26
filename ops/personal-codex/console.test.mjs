import test from 'node:test';
import {reviewFixture} from './review-fixtures.mjs';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store, sha, validateTask, checkOwner, checkMutation, cookieToken, requireQuota, parseEvent, compactReview } from './core.mjs';
import { createConsole } from './server.mjs';

const task = () => ({ key: randomUUID(), skill: 'market-review', date: '2026-10-16', codes: [], message: '分析风险', model: 'gpt-6.1-sol', effort: 'high' });
const owner = { id: 17, username: 'mufeng', roles: [{ code: 'admin' }], mustChangePassword: false };
const token = 'a'.repeat(64), origin = 'https://stock.example';
const headers = { Cookie: `stock_session=${token}`, Origin: origin, 'X-CSRF-Token': sha(`csrf:${token}`), 'Content-Type': 'application/json' };
const meta = { authType: 'chatgpt', plan: 'pro', quota: { ordinaryUsageAllowed: true, primary: { usedPercent: 2 }, spendControlReached: false }, models: [{ model: 'gpt-6.1-sol', efforts: ['high', 'low'] }, { model: 'gpt-6-astra', efforts: ['high'] }] };

test('owner binding rejects other administrators, removed role and password-change-required accounts', () => {
  checkOwner(owner, 17);
  for (const user of [{ ...owner, id: 18 }, { ...owner, roles: [] }, { ...owner, mustChangePassword: true }, null]) assert.throws(() => checkOwner(user, 17));
});
test('CSRF, exact origin and unambiguous session cookie are mandatory', () => {
  checkMutation({ origin, 'x-csrf-token': headers['X-CSRF-Token'] }, token, origin);
  assert.equal(cookieToken(headers.Cookie), token);
  for (const h of [{}, { origin: 'https://evil.example', 'x-csrf-token': headers['X-CSRF-Token'] }, { origin, 'x-csrf-token': 'b'.repeat(64) }]) assert.throws(() => checkMutation(h, token, origin));
  assert.throws(() => cookieToken(`${headers.Cookie}; ${headers.Cookie}`));
});
test('rejects command injection, invalid models, skill traversal, excessive input and stock scopes', () => {
  validateTask(task());
  for (const patch of [{ model: 'x; rm -rf /' }, { effort: '$(env)' }, { skill: '../secret' }, { date: '2026-02-31' }, { command: 'env' }, { message: 'x'.repeat(2001) }, { codes: ['https://evil.example'] }, { skill: 'candidate-compare' }]) assert.throws(() => validateTask({ ...task(), ...patch }));
});
test('unknown quota and nearly exhausted quota fail closed', () => {
  requireQuota(meta.quota);
  for (const q of [{}, { ...meta.quota, ordinaryUsageAllowed: false }, { ...meta.quota, primary: { usedPercent: 90 } }, { ...meta.quota, secondary: { usedPercent: 100 } }]) assert.throws(() => requireQuota(q));
});
test('idempotency, budget reservation, restart and conversation controls survive persistence', () => {
  const dir = mkdtempSync(join(tmpdir(), 'stock-codex-test-'));
  try {
    const s = new Store(dir), input = task(), first = s.admit(input).task;
    assert.equal(s.admit(input).duplicate, true);
    assert.throws(() => s.admit({ ...input, message: 'changed' }));
    assert.throws(() => s.admit(task()));
    assert.equal(s.usedToday().tokens, 32000);
    first.status = 'completed'; first.snapshot = { date: input.date, version:'review/v4' }; first.answer = '结论'; first.usage = { input_tokens: 100, output_tokens: 20 }; s.save();
    assert.equal(s.usedToday().tokens, 120);
    assert.throws(() => s.admit(task(), { maxCalls: 1 }));
    assert.throws(() => s.admit(task(), { dailyTokens: 32000 }));
    assert.throws(() => s.admit({ ...task(), parentId: first.id, date: '2026-10-15' }));
    const second = s.admit({ ...task(), parentId: first.id }).task;
    assert.equal(second.history.length, 1);
    const restored = new Store(dir);
    assert.equal(restored.tasks[1].status, 'interrupted');
    assert.equal(restored.usedToday().tokens, 32120);
    assert(!readFileSync(join(dir, 'tasks.json'), 'utf8').includes(token));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('event parser treats non-message metadata as metadata; records reported tokens and detects tools', () => {
  const r = { completedTurns: 0 };
  parseEvent(r, { type: 'item.completed', item: { type: 'warning', text: 'not a tool' } });
  assert.equal(r.toolAttempt, undefined);
  parseEvent(r, { type: 'item.completed', item: { type: 'agent_message', text: 'OK' } });
  parseEvent(r, { type: 'turn.completed', usage: { input_tokens: 11022, output_tokens: 5, reasoning_output_tokens: 0 } });
  assert.equal(r.answer, 'OK'); assert.equal(r.completedTurns, 1); assert.equal(r.usage.input_tokens, 11022);
  parseEvent(r, { type: 'item.started', item: { type: 'command_execution' } }); assert.equal(r.toolAttempt, true);
});
test('review compaction discloses omitted rows and excludes unrelated fields', () => {
  const r = compactReview({ date: '2026-10-16', items: Array.from({ length: 20 }, (_, i) => ({ tsCode: `${i}`, secret: 'never-send' })) });
  assert.equal(r.included, 12); assert.equal(r.omitted, 8); assert(!JSON.stringify(r).includes('never-send'));
});
async function harness(fn, { user = owner, quota = meta, data = null, run, fetchStatus = () => 200 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'stock-console-http-'));
  const calls = { models: 0, stops: 0, metadata: 0, paths: [] };
  const runner = { metadata: async () => { calls.metadata++; return quota; }, stop: () => { calls.stops++; }, run: async (t, prompt, onText) => {
    calls.models++; assert(!prompt.includes(token)); assert(!prompt.includes('OPENAI_API_KEY'));
    return run ? run(t, prompt, onText) : { success: true, answer: '<script>not executable</script>', completedTurns: 1, usage: { input_tokens: 100, output_tokens: 5 } };
  } };
  const { server, store } = createConsole({ ownerId: 17, origin, backend: 'http://backend/api', enabled: true, dataDir: dir }, {
    runner, fetch: async (url, options) => { calls.paths.push(url); assert.equal(options.headers.Cookie, headers.Cookie); return new Response(JSON.stringify({ data: url.endsWith('/auth/me') ? user : data || reviewFixture(url) }), { status: fetchStatus(url) }); },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = (path, method = 'GET', body, extra = {}) => fetch(base + '/personal-ai' + path, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  try { await fn({ req, calls, store, server }); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); rmSync(dir, { recursive: true, force: true }); }
}
test('HTTP browsing does not call a model; task submission executes once and result is protected', async () => {
  await harness(async ({ req, calls, store }) => {
    assert.equal((await req('/')).status, 200);
    assert.equal((await req('/api/status')).status, 200);
    assert.equal(calls.models, 0); assert.equal(calls.metadata, 0);
    const input = task(), response = await req('/api/tasks', 'POST', input);
    assert.equal(response.status, 202); const first = await response.json();
    for (let i = 0; i < 30 && store.tasks[0].status !== 'completed'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(store.tasks[0].status, 'completed');
    assert.equal((await req('/api/tasks', 'POST', input)).status, 200); assert.equal(calls.models, 1);
    assert.equal((await req(`/api/tasks/${first.id}`)).status, 200);
    assert.equal((await req('/api/tasks', 'POST', task(), { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await req('/api/status', 'GET', undefined, { Cookie: '' })).status, 401);
    assert.equal(calls.models, 1);
  });
});
test('other administrators cannot read page, task list or start a job', async () => {
  await harness(async ({ req, calls }) => {
    for (const path of ['/', '/api/status', `/api/tasks/${randomUUID()}`]) assert.equal((await req(path)).status, 403);
    assert.equal((await req('/api/tasks', 'POST', task())).status, 403); assert.equal(calls.models, 0);
  }, { user: { ...owner, id: 99 } });
});

test('same-site embedded browsing preserves authentication and never starts inference', async () => {
  await harness(async ({ req, calls }) => {
    const r = await req('/?embedded=1');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert.equal((await req('/?embedded=1', 'GET', undefined, { Cookie: '' })).status, 401);
    assert.equal((await req('/api/status')).status, 200);
    assert.equal(calls.models, 0);
    assert.equal(calls.metadata, 0);
  });
});

test('page resource reads share short-lived identity checks while writes revalidate', async () => {
  await harness(async ({ req, calls }) => {
    const results = await Promise.all(['/', '/app.js', '/style.css', '/api/status'].map(path => req(path)));
    assert(results.every(r => r.status === 200));
    assert.equal(calls.paths.filter(path => path.endsWith('/auth/me')).length, 1);
    assert.equal((await req('/api/account', 'POST', {})).status, 200);
    assert.equal(calls.paths.filter(path => path.endsWith('/auth/me')).length, 2);
    assert.equal(calls.models, 0);
  });
});

test('revoking admin role is enforced on writes even while a read identity is cached', async () => {
  const user = { ...owner, roles: [{ code: 'admin' }] };
  await harness(async ({ req, calls }) => {
    assert.equal((await req('/api/status')).status, 200);
    user.roles = [];
    assert.equal((await req('/api/account', 'POST', {})).status, 403);
    assert.equal(calls.metadata, 0);
    assert.equal(calls.models, 0);
  }, { user });
});
test('insufficient quota prevents inference and releases reservation', async () => {
  await harness(async ({ req, store, calls }) => {
    await req('/api/tasks', 'POST', task());
    for (let i = 0; i < 30 && store.tasks[0].status !== 'failed'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(store.tasks[0].status, 'failed'); assert.equal(calls.models, 0); assert.equal(store.usedToday().tokens, 0);
  }, { quota: { ...meta, quota: { ...meta.quota, ordinaryUsageAllowed: false } } });
});
test('failure is not retried and unknown usage keeps a conservative reservation', async () => {
  await harness(async ({ req, store, calls }) => {
    await req('/api/tasks', 'POST', task());
    for (let i = 0; i < 30 && store.tasks[0].status !== 'failed'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(calls.models, 1); assert.equal(store.usedToday().tokens, 32000); assert.equal(store.tasks[0].status, 'failed');
  }, { run: async () => ({ success: false, answer: '', usage: null, error: 'failure' }) });
});
test('cancelling a running task stops the executor and does not retry it', async () => {
  let release;
  await harness(async ({ req, store, calls }) => {
    const response = await req('/api/tasks', 'POST', task()), submitted = await response.json();
    for (let i = 0; i < 30 && calls.models === 0; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(calls.models, 1);
    assert.equal((await req(`/api/tasks/${submitted.id}/cancel`, 'POST', {})).status, 200);
    assert.equal(calls.stops, 1); release();
    for (let i = 0; i < 30 && store.tasks[0].status !== 'cancelled'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(store.tasks[0].status, 'cancelled'); assert.equal(calls.models, 1);
  }, { run: () => new Promise(resolve => { release = () => resolve({ success: false, answer: '', usage: null }); }) });
});
test('oversized business snapshot is blocked before calling a model', async () => {
  await harness(async ({ req, store, calls }) => {
    await req('/api/tasks', 'POST', task());
    for (let i = 0; i < 30 && store.tasks[0].status !== 'failed'; i++) await new Promise(r => setTimeout(r, 5));
    assert.equal(calls.models, 0); assert.equal(store.tasks[0].status, 'failed');
  }, { data: { date: '2026-10-16', snapshot: {unexpected:'large'.repeat(6000)},items: [] } });
});

test('market HTTP errors stop before metadata/inference, release reservations and fail preview clearly', async () => {
  for (const status of [404,500]) await harness(async ({req,store,calls})=>{
    const preview=await req('/api/preview','POST',task());assert.equal(preview.status,503);assert.match((await preview.json()).error,new RegExp('HTTP '+status));
    assert.equal(store.tasks.length,0);
    await req('/api/tasks','POST',task());
    for(let i=0;i<50&&store.tasks[0].status!=='failed';i++)await new Promise(r=>setTimeout(r,5));
    assert.equal(store.tasks[0].status,'failed');assert.equal(calls.models,0);assert.equal(calls.metadata,0);assert.equal(store.usedToday().tokens,0);
  }, {fetchStatus:url=>url.includes('/analysis/market/')?status:200});
});

test('SSE delivers partial text before completion, reconnects without resubmission and protects owner access', async () => {
  let release;
  await harness(async ({req,calls,store}) => {
    const task = await (await req('/api/tasks','POST', taskInput())).json();
    for(let i=0;i<50&&!calls.models;i++) await new Promise(r=>setTimeout(r,5));
    const response = await req(`/api/tasks/${task.id}/events`);
    assert.equal(response.headers.get('content-type'),'text/event-stream; charset=utf-8');
    const reader = response.body.getReader(), first = await reader.read();
    const partial = JSON.parse(new TextDecoder().decode(first.value).split('data: ')[1].trim());
    assert.equal(partial.answer,'第一段'); assert.equal(partial.status,'running');
    await reader.cancel();
    assert.equal((await req(`/api/tasks/${task.id}/events`,'GET',undefined,{Cookie:''})).status,401);
    release();
    for(let i=0;i<50&&store.tasks[0].status!=='completed';i++)await new Promise(r=>setTimeout(r,5));
    const final = await (await req(`/api/tasks/${task.id}/events`)).text();
    assert.match(final,/第一段完成/); assert.equal(calls.models,1);
  }, {run:(_task,_prompt,onText)=>new Promise(resolve=>{onText('第一段');release=()=>resolve({success:true,answer:'第一段完成',completedTurns:1,usage:{input_tokens:10,output_tokens:5}});})});
});
const taskInput=task;
