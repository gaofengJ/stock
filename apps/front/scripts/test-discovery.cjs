const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, resolve = require) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'exports', source)(resolve, exports);
  return exports;
}
const site = load('discovery/site.ts');
test('only exact public content routes bypass the existing account boundary', () => {
  let pathname = '/';
  const boundary = load('discovery/Boundary.tsx', (name) => {
    if (name === 'next/navigation') return { usePathname: () => pathname };
    if (name === './site') return site;
    if (name === '@/auth/Boundary') return { default: () => React.createElement('span', null, 'protected') };
    if (name === '@/components/StockActions/Provider') return { default: ({ children }) => children };
    return require(name);
  }).default;
  for (pathname of ['/', '/guides/', ...site.guides.map(g => '/guides/' + g.slug + '/')]) {
    assert.match(renderToStaticMarkup(React.createElement(boundary, null, 'public article')), /public article/);
  }
  for (pathname of ['/admin/users/', '/strategy/', '/review/', '/blog/', '/guides/admin/', '/guides/daily-review/private/', '/guides-evil/']) {
    assert.equal(renderToStaticMarkup(React.createElement(boundary, null, 'private content')), '<span>protected</span>');
  }
});
test('public metadata and sitemap use canonical public URLs and exclude private pages', () => {
  const map = load('app/sitemap.ts', name => name === '@/discovery/site' ? site : require(name)).default();
  assert.equal(map.length, 6);
  for (const entry of map) {
    assert.equal(new URL(entry.url).origin, site.siteUrl);
    assert.equal(site.isDiscoveryPath(new URL(entry.url).pathname), true);
  }
  const metadata = site.publicMetadata('test', 'description', '/guides/');
  assert.equal(metadata.robots.index, true);
  assert.equal(metadata.alternates.canonical, site.siteUrl + '/guides/');
});
test('structured data escapes script-closing characters without changing JSON', () => {
  const StructuredData = load('discovery/StructuredData.tsx').default;
  const data = { name: '</script><script>alert(1)</script>' };
  const html = renderToStaticMarkup(React.createElement(StructuredData, { data }));
  assert.equal((html.match(/<script/g) || []).length, 1);
  assert.deepEqual(JSON.parse(html.replace(/^<script[^>]*>|<\/script>$/g, '')), data);
});
