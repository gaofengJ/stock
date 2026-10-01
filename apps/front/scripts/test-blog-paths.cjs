const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const output = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../src/app/blog/path.ts'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
new Function('exports', output)(exportsObject);
const {normalizeBlogPath} = exportsObject;
test('keeps article paths and anchors while normalizing frame prefixes', () => {
  assert.equal(normalizeBlogPath('/blog-frame/reviews/2026/article.html#数据'), '/reviews/2026/article#数据');
  assert.equal(normalizeBlogPath('/trading-rules/article'), '/trading-rules/article');
  assert.equal(normalizeBlogPath('/blog-frame/'), '/');
});
test('rejects external URLs, traversal, encoded separators and invalid messages', () => {
  for (const value of ['https://evil.invalid', '//evil.invalid', '/%2f/evil', '/a/../api', '/a/%2e%2e/api', '/a\\evil', '/article?redirect=evil', '/a%00', '/%zz', null, {}, '']) assert.equal(normalizeBlogPath(value), undefined, String(value));
});
