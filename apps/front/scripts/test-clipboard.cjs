const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/clipboard.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', code)(exportsObject);
const { copyText } = exportsObject;

function browser(t, { clipboard, legacy = true, dialog = false } = {}) {
  const calls = [];
  const original = Object.getOwnPropertyDescriptors(globalThis);
  class Element {
    closest(selector) { assert.equal(selector, '[role="dialog"]'); return dialog ? container : null; }
    focus() { calls.push('restore-focus'); }
  }
  const container = { appendChild(field) { calls.push(['dialog', field.value]); } };
  const field = {
    style: {},
    focus() { calls.push('focus'); },
    select() { calls.push('select'); },
    remove() { calls.push('remove'); },
  };
  Object.defineProperties(globalThis, {
    navigator: { configurable: true, value: { clipboard } },
    HTMLElement: { configurable: true, value: Element },
    window: { configurable: true, value: { getSelection: () => null } },
    document: { configurable: true, value: {
      activeElement: new Element(),
      body: { appendChild(element) { calls.push(['body', element.value]); } },
      createElement: () => field,
      execCommand(command) {
        assert.equal(command, 'copy');
        if (legacy instanceof Error) throw legacy;
        return legacy;
      },
    } },
  });
  t.after(() => {
    for (const key of ['navigator', 'HTMLElement', 'window', 'document']) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]);
      else delete globalThis[key];
    }
  });
  return calls;
}

test('clipboard writes the exact text including leading zeroes and Chinese names', async (t) => {
  const written = [];
  const calls = browser(t, { clipboard: { writeText: async (text) => written.push(text) } });
  for (const text of ['000503', '国新健康', '000503 国新健康']) assert.equal(await copyText(text), true);
  assert.deepEqual(written, ['000503', '国新健康', '000503 国新健康']);
  assert.deepEqual(calls, []);
});

test('HTTP pages use legacy copy and clean up the temporary field', async (t) => {
  const calls = browser(t);
  assert.equal(await copyText('000513'), true);
  assert.deepEqual(calls, [['body', '000513'], 'focus', 'select', 'remove', 'restore-focus']);
});

test('denied clipboard permission falls back within the current dialog', async (t) => {
  const calls = browser(t, { clipboard: { writeText: async () => { throw new Error('Denied'); } }, dialog: true });
  assert.equal(await copyText('603418'), true);
  assert.deepEqual(calls, [['dialog', '603418'], 'focus', 'select', 'remove', 'restore-focus']);
});

test('copy denial requests manual copying and still restores focus', async (t) => {
  const calls = browser(t, { legacy: false });
  assert.equal(await copyText('920001'), false);
  assert.deepEqual(calls.slice(-2), ['remove', 'restore-focus']);
});

test('unsupported legacy copying requests manual copying without throwing', async (t) => {
  const calls = browser(t, { legacy: new Error('Unsupported') });
  assert.equal(await copyText('000503'), false);
  assert.deepEqual(calls.slice(-2), ['remove', 'restore-focus']);
});
