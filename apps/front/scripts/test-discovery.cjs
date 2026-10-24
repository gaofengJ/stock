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
const trial = load('auth/trial.ts');
const publicResolve = (name) => {
  if (name === 'next/link') return { default: ({ children, href, ...props }) => React.createElement('a', { href, ...props }, children) };
  if (name === 'next/navigation') return { notFound: () => { throw new Error('not found'); } };
  if (name === '@/discovery/site') return site;
  if (name === '@/auth/trial') return trial;
  if (name === '@/discovery/content') return load('discovery/content.ts');
  if (name === '@/discovery/Shell') return { default: ({ children }) => React.createElement('main', null, children) };
  if (name === '@/discovery/HomeRedirect' || name === '@/discovery/ReviewIllustration' || name === '@/discovery/StructuredData') return { default: () => null };
  return require(name);
};

test('homepage keeps the three core paths, all research tools and guides without duplicate feature descriptions', () => {
  const Home = load('app/page.tsx', publicResolve).default;
  const html = renderToStaticMarkup(React.createElement(Home));
  for (const route of ['/analysis/overview/', '/strategy/', '/review/', '/basic/stock/', '/basic/stock/broker-picks/', '/strategy/?view=performance', '/register/', ...site.guides.map(g => `/guides/${g.slug}/`)]) {
    assert.ok(html.includes(`href="${route}"`), route);
  }
  assert.equal((html.match(/class="discovery-card"/g) || []).length, 3);
  assert.equal(trial.guestTrialMinutes, 30);
  assert.match(html, /30 分钟/);
  assert.match(html, /存入服务器/);
  assert.doesNotMatch(html, /·|5\s*分钟|草稿按账号和交易日期保存在当前浏览器/);
});

test('all guides have a separated tool entry, concise steps and no middle-dot separators', async () => {
  const Guide = load('app/guides/[slug]/page.tsx', publicResolve).default;
  for (const guide of site.guides) {
    const html = renderToStaticMarkup(await Guide({ params: Promise.resolve({ slug: guide.slug }) }));
    assert.match(html, /class="discovery-tool-entry"/);
    assert.match(html, /class="discovery-actions"/);
    assert.match(html, /30 分钟/);
    assert.ok(html.includes(`href="${guide.tool}"`));
    assert.doesNotMatch(html, /·|5\s*分钟|文档底部/);
  }
  for (const file of ['discovery/Shell.tsx', 'auth/Entry.tsx']) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), /·|5\s*分钟/);
  }
});
test('only exact public content routes bypass the existing account boundary', () => {
  let pathname = '/';
  const boundary = load('discovery/Boundary.tsx', (name) => {
    if (name === 'next/navigation') return { usePathname: () => pathname };
    if (name === './site') return site;
    if (name === '@/auth/Boundary') return { default: () => React.createElement('span', null, 'protected') };
    if (name === '@/components/PersonalAi/TaskState') return { default: ({ children }) => children };
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
