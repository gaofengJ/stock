const assert = require('node:assert/strict');
const { test } = require('node:test');
const { releaseScope } = require('./release-scope.cjs');
const { render } = require('./render-runtime-env.cjs');
const { templateIssues } = require('./check-env-secrets.cjs');

test('production templates reject literal credentials without returning values', () => {
  assert.deepEqual(templateIssues('DB_PASSWORD = __DB_PASSWORD__\nTUSHARE_CONF_TOKEN=__TUSHARE_CONF_TOKEN__\nLOGGER_LEVEL=info'), []);
  assert.deepEqual(templateIssues('DB_PASSWORD = "fixture-private"\nTUSHARE_CONF_TOKEN=fixture-token'), ['DB_PASSWORD', 'TUSHARE_CONF_TOKEN']);
});

test('frontend-only changes do not deploy the backend', () => {
  assert.deepEqual(releaseScope(['apps/front/src/app/page.tsx']), { backend: false, frontend: true });
});

test('production push releases both components when an earlier queued backend push was coalesced away', () => {
  assert.deepEqual(releaseScope(['apps/front/src/app/page.tsx'], true, 'push'), { backend: true, frontend: true });
  assert.deepEqual(releaseScope([], true, 'push'), { backend: true, frontend: true });
  assert.deepEqual(releaseScope(['apps/front/src/app/page.tsx'], true, 'pull_request'), { backend: false, frontend: true });
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
