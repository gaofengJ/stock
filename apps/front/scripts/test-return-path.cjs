const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/auth/return-path.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exported = {};
new Function('exports', code)(exported);
test('login return preserves stock, date and anchor while rejecting external redirects', () => {
  assert.equal(exported.safeReturnPath('/basic/stock/detail/?code=003021.SZ&date=2026-10-22#financial'), '/basic/stock/detail/?code=003021.SZ&date=2026-10-22#financial');
  for (const value of ['https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/%2f%2fevil.invalid', '/%0aevil', '/login?next=/', '/api/auth/logout', 'javascript:alert(1)', '/%']) assert.equal(exported.safeReturnPath(value), null);
});
