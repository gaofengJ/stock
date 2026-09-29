const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function client() {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/auth/client.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', code)(() => ({ readApiResponse: async r => r.json(), userError: e => e }), exports);
  return exports;
}

test('guest routes expose business pages but never profile or administration', () => {
  const auth = client();
  const user = { guest: true, permissions: ['analysis:overview'], catalog: [{ code: 'analysis:overview', route: '/analysis/overview' }] };
  assert.equal(auth.allowedPath(user, '/'), true);
  assert.equal(auth.allowedPath(user, '/analysis/overview/'), true);
  assert.equal(auth.allowedPath(user, '/profile/'), false);
  assert.equal(auth.allowedPath(user, '/admin'), false);
  assert.equal(auth.homePath(user), '/analysis/overview');
  assert.equal(auth.allowedPath({ ...user, guest: false }, '/profile'), true);
});

test('login activity belongs to user management and is unavailable to other module administrators', () => {
  const auth = client();
  const catalog = [{ code: 'users:manage', route: '/admin/users' }, { code: 'roles:manage', route: '/admin/roles' }];
  assert.equal(auth.allowedPath({ permissions: ['users:manage'], catalog }, '/admin/users/activity/'), true);
  assert.equal(auth.allowedPath({ permissions: ['roles:manage'], catalog }, '/admin/users/activity/'), false);
  assert.equal(auth.allowedPath({ permissions: [], catalog }, '/admin/users/activity/'), false);
});

test('concurrent access checks share one request, avoiding duplicate trial starts', async () => {
  const original = global.fetch;
  let finish; let calls = 0;
  global.fetch = async () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  try {
    const auth = client();
    const a = auth.getAccess(true); const b = auth.getAccess(true);
    assert.equal(calls, 1); assert.equal(a, b);
    finish({ ok: true, json: async () => ({ data: { user: { guest: true }, trial: { remainingMs: 299999 } } }) });
    assert.equal((await a).user.guest, true);
    await b;
  } finally { global.fetch = original; }
});

test('successful login replaces pending guest state and uses the rotated CSRF token', async () => {
  const original = global.fetch;
  let finishGuest;
  let accessCalls = 0;
  const headers = [];
  global.fetch = async (url, options) => {
    if (url.includes('/auth/access')) {
      accessCalls++;
      if (accessCalls === 1) return new Promise(resolve => { finishGuest = resolve; });
      return { ok: true, json: async () => ({ data: { user: { id: 8 }, trial: null } }) };
    }
    headers.push(options.headers);
    return { ok: true, json: async () => ({ data: { csrfToken: url.endsWith('/csrf') ? 'before' : 'after' } }) };
  };
  try {
    const auth = client();
    const old = auth.getAccess(true);
    await auth.api('/auth/register', 'POST', { username: 'fixture' }, false);
    const signedIn = auth.getAccess(false);
    finishGuest({ ok: true, json: async () => ({ data: { user: { guest: true } } }) });
    await old;
    assert.equal((await signedIn).user.id, 8);
    await auth.api('/users/me', 'PATCH', { avatar: 'bull-red-star' }, false);
    assert.equal(headers.at(-1)['X-CSRF-Token'], 'after');
  } finally { global.fetch = original; }
});
