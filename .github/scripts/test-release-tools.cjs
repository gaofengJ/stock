const assert = require('node:assert/strict');
const { test } = require('node:test');
const { releaseScope } = require('./release-scope.cjs');
const { render } = require('./render-runtime-env.cjs');

test('frontend-only changes do not deploy the backend', () => {
  assert.deepEqual(releaseScope(['apps/front/src/app/page.tsx']), { backend: false, frontend: true });
});
test('backend and shared changes retain coupled deployment', () => {
  for (const file of ['apps/back/src/main.ts', 'pnpm-lock.yaml', '.dockerignore', '.github/workflows/front-cd.yml']) {
    assert.deepEqual(releaseScope([file]), { backend: true, frontend: true });
  }
});
test('a truncated change list cannot silently skip backend verification', () => {
  assert.deepEqual(releaseScope(['apps/front/src/app/page.tsx'], false), { backend: true, frontend: true });
  assert.deepEqual(releaseScope(['apps/blog/docs/readme.md']), { backend: false, frontend: false });
});
test('runtime configuration preserves dotenv quoting and defaults', () => {
  assert.equal(render('DB_PASSWORD=__DB_PASSWORD__\nAUTH_IDLE_HOURS=12\n', { DB_PASSWORD: 'quoted # value' }), 'DB_PASSWORD="quoted # value"\nAUTH_IDLE_HOURS=12\n');
});
test('missing or unsafe values fail without including secret values in errors', () => {
  for (const value of [undefined, '', 'secret\nline', 'secret\rline', 'secret"quote']) {
    assert.throws(() => render('DB_PASSWORD=__DB_PASSWORD__', { DB_PASSWORD: value }), { message: 'Missing or unsupported environment value: DB_PASSWORD' });
  }
});
