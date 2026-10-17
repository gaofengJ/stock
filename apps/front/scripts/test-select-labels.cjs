const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const src = path.join(__dirname, '../src');

test('Select labels stay visible for empty, selected, disabled and repeated controls, with associated unique IDs', () => {
  const file = path.join(src, 'components/SelectField/index.tsx');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)((name) => name.endsWith('.css') ? {} : require(name), exports);
  const SelectField = exports.default;
  const html = renderToStaticMarkup(React.createElement('div', null,
    ...['', '主板', '创业板'].map((value, index) => React.createElement(SelectField, { label: '市场范围', key: index },
      React.createElement('input', { value, readOnly: true, disabled: index === 2 }))),
    React.createElement(SelectField, { label: '已有 ID' }, React.createElement('input', { id: 'explicit-field' })),
  ));
  const labels = [...html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>(.*?)<\/label>/g)];
  assert.equal(labels.length, 4);
  assert.equal(new Set(labels.map((m) => m[1])).size, 4);
  labels.forEach((m) => assert.ok(html.includes(`id="${m[1]}"`)));
  assert.deepEqual(labels.map((m) => m[2]), ['市场范围', '市场范围', '市场范围', '已有 ID']);
  assert.equal(labels.at(-1)[1], 'explicit-field');
});

test('every platform Select has a persistent visible label, including generated search forms', () => {
  const failures = [];
  let count = 0;
  const attr = (opening, name) => opening.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === name)?.initializer;
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) { scan(file); continue; }
      if (!/\.[jt]sx?$/.test(file)) continue;
      const source = fs.readFileSync(file, 'utf8');
      const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      function visit(node) {
        const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null;
        if (opening && /^(Select|select|TreeSelect|Cascader)$/.test(opening.tagName.getText(sf))) {
          count++;
          let labelled = false;
          for (let parent = node.parent; parent; parent = parent.parent) {
            if (ts.isJsxElement(parent) && ['SelectField', 'Form.Item'].includes(parent.openingElement.tagName.getText(sf))) {
              labelled = Boolean(attr(parent.openingElement, 'label')); break;
            }
            if (ts.isObjectLiteralExpression(parent) && parent.properties.some((p) => p.name?.getText(sf) === 'component')) {
              labelled = parent.properties.some((p) => p.name?.getText(sf) === 'label' && p.initializer?.text); break;
            }
          }
          const id = attr(opening, 'id');
          if (id && ts.isStringLiteral(id)) {
            labelled ||= source.includes(`htmlFor="${id.text}"`);
          }
          const labelledBy = attr(opening, 'aria-labelledby');
          if (labelledBy && ts.isStringLiteral(labelledBy)) {
            labelled ||= source.includes(`id="${labelledBy.text}"`);
          }
          if (!labelled) failures.push(`${path.relative(src, file)}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(sf);
    }
  }
  scan(src);
  assert.ok(count >= 59, 'scan must cover the full platform');
  assert.deepEqual(failures, [], 'Select requires SelectField, Form.Item, a labelled search config or an associated visible label');
});
