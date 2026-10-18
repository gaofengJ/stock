const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/auth/client.ts'), 'utf8');
const loaded = {};
new Function('exports', 'require', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(loaded, () => ({}));

test('personal console entry and direct route require the immutable owner ID and admin role', () => {
  const owner = { id: 1, username: 'mufeng', roles: [{ code: 'admin' }], permissions: ['admin'], catalog: [{ code: 'admin', route: '/admin' }], mustChangePassword: false };
  for (const route of ['/admin/ai', '/admin/ai/', '/admin/ai/history']) {
    assert.equal(loaded.allowedPath(owner, route), true);
    for (const user of [null, { ...owner, id: 2 }, { ...owner, roles: [{ code: 'user' }] }, { ...owner, guest: true }, { ...owner, mustChangePassword: true }]) {
      assert.equal(loaded.allowedPath(user, route), false);
    }
    assert.equal(loaded.allowedPath({ ...owner, username: 'renamed' }, route), true);
    assert.equal(loaded.allowedPath({ ...owner, id: 3, username: 'mufeng' }, route), false);
  }
  assert.equal(loaded.allowedPath({ ...owner, id: 2 }, '/admin/users'), true);
});
