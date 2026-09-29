const assert = require('node:assert/strict');
const fs = require('node:fs');
const manifest = require('../package.json');

for (const name of Object.keys(manifest.dependencies)) require.resolve(name);
assert.equal(fs.existsSync('/usr/local/bin/pnpm'), false, 'pnpm belongs in the build stage');
assert.equal(fs.existsSync('.env.production'), false, 'Production configuration must be mounted at runtime');
if (process.env.APP_ENV_FILE) {
  const { options } = require('../dist/migration-data-source').default;
  assert.equal(options.host, 'runtime-config.invalid');
  assert.equal(options.database, 'stock_ci');
  assert.equal(options.password, 'quoted # value');
}
console.info('Runtime dependencies and external configuration verified');
