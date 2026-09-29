const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

let state;
const moduleUnderTest = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/analysis/components/MarketCompatibility.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
}).outputText;
new Function('require', 'exports', code)((name) => {
  if (name === './MarketContext') return { useMarket: () => state };
  if (name === '@/components/Loading') return { default: () => React.createElement('span', null, 'loading') };
  if (name === 'antd') return { Alert: () => null };
  return require(name);
}, moduleUnderTest.exports);
const Compatibility = moduleUnderTest.exports.default;

function render(nextState) {
  state = nextState;
  return renderToStaticMarkup(React.createElement(Compatibility, {
    legacy: React.createElement('div', null, 'existing-data'),
  }, React.createElement('div', null, 'new-data')));
}
test('新版没有已发布数据时，显示原有数据页面', () => {
  assert.equal(render({ status: { latestDate: null }, error: '' }), '<div>existing-data</div>');
});
test('新版状态请求失败不能阻断原有接口', () => {
  assert.equal(render({ status: null, error: '服务异常' }), '<div>existing-data</div>');
});
test('状态加载时不提前请求新版页面数据', () => {
  assert.equal(render({ status: null, error: '' }), '<span>loading</span>');
});
test('新版数据发布之后启用新版页面', () => {
  assert.equal(render({ status: { latestDate: '2026-09-24' }, error: '' }), '<div>new-data</div>');
});
test('发布状态变化后可以恢复旧版，重新发布后可以继续新版', () => {
  assert.match(render({ status: { latestDate: '2026-09-24' }, error: '' }), /new-data/);
  assert.match(render({ status: { latestDate: null }, error: '' }), /existing-data/);
  assert.match(render({ status: { latestDate: '2026-09-24' }, error: '' }), /new-data/);
});
