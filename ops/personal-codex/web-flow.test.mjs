import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

test('embedded view, model selection and new conversation do not submit a task', async () => {
  const nodes = new Map(), requests = [], messages = [];
  const make = () => ({ value: '', disabled: false, textContent: '', children: [], classList: { add() {}, toggle() {} },
    append(child) { this.children.push(child); }, replaceChildren() { this.children = []; }, focus() {}, options: [] });
  const get = id => { if (!nodes.has(id)) nodes.set(id, make()); return nodes.get(id); };
  get('model').options = ['gpt-6.1-sol', 'gpt-6-astra'].map(value => ({ value, disabled: false }));
  get('model').value = 'gpt-6.1-sol';
  get('effort').options = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].map(value => ({ value, disabled: false }));
  get('effort').value = 'high';
  Object.defineProperty(get('effort'), 'selectedOptions', { get: () => get('effort').options.filter(o => o.value === get('effort').value) });
  const metadata = { plan: 'pro', models: [{ model: 'gpt-6.1-sol', efforts: ['low', 'high'] }, { model: 'gpt-6-astra', efforts: ['medium', 'high'] }], quota: { primary: { usedPercent: 5 } } };
  const state = { user: { id: 1, username: 'mufeng' }, today: { calls: 0, tokens: 0 }, limits: { dailyCalls: 20, dailyTokens: 200000 }, enabled: true, tasks: [], metadata };
  const document = { body: { scrollHeight: 1200, classList: { add() {} } }, getElementById: get, createElement: make, addEventListener() {} };
  const window = { parent: { postMessage: message => messages.push(message) } };
  const context = vm.createContext({ document, window, location: { search: '?embedded=1', origin: 'https://example.test' },
    URLSearchParams, Date, crypto: webcrypto, clearTimeout, setTimeout, ResizeObserver: class { observe() {} },
    fetch: async (url, options = {}) => {
      requests.push([url, options.method || 'GET']);
      const data = url === '/personal-ai/api/status' ? state : url === '/api/auth/csrf' ? { data: { csrfToken: 'test-only' } } : url === '/personal-ai/api/account' ? metadata : null;
      assert.ok(data, 'No task or inference endpoint may be requested during this flow');
      return { ok: true, json: async () => data };
    },
  });
  vm.runInContext(readFileSync(new URL('./web/app.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(get('model').value, 'gpt-6.1-sol'); assert.equal(get('effort').value, 'high');
  assert.equal(get('owner').textContent, 'mufeng'); assert.equal(messages.at(-1).status, 'ready');
  get('model').value = 'gpt-6-astra'; get('model').onchange();
  assert.equal(get('effort').options.find(o => o.value === 'low').disabled, true);
  get('new-chat').onclick(); assert.equal(get('message').value, ''); assert.equal(get('date').disabled, false);
  await get('refresh-account').onclick();
  assert.equal(get('refresh-account').disabled, false);
  assert.match(get('notice').textContent, /未发起推理/);
  assert.equal(requests.filter(([url]) => url.includes('/tasks')).length, 0);
});
