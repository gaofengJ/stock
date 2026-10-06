const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const key = 'a'.repeat(32);
async function run(urls, status = 200, verified = true) {
  const calls = [], logs = [], processMock = { env: { SITE_INDEXNOW_KEY: key } };
  const context = vm.createContext({ process: processMock, URL, Set, AbortSignal, console: { log: message => logs.push(message), error: message => logs.push(message) }, fetch: async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return { ok: true, text: async () => verified ? key : 'incorrect' };
    if (calls.length === 2) return { ok: true, text: async () => '<urlset>' + urls.map(url => '<url><loc>' + url + '</loc></url>').join('') + '</urlset>' };
    return { status };
  } });
  const script = fs.readFileSync(path.join(__dirname, 'submit-indexnow.cjs'), 'utf8');
  await vm.runInContext(script, context);
  return { calls, logs, exitCode: processMock.exitCode };
}
test('only verified public pages are submitted; receipts are not indexing claims', async () => {
  for (const status of [200, 202]) {
    const result = await run(['https://stock.mufengtongxue.com/', 'https://stock.mufengtongxue.com/guides/'], status);
    assert.equal(result.calls.length, 3);
    assert.equal(result.calls[2].url, 'https://api.indexnow.org/indexnow');
    assert.deepEqual(JSON.parse(result.calls[2].options.body).urlList, ['https://stock.mufengtongxue.com/', 'https://stock.mufengtongxue.com/guides/']);
    assert.match(result.logs.join(''), /does not confirm indexing/);
  }
});
test('private, foreign and parameterized URLs cannot be submitted', async () => {
  for (const url of ['https://stock.mufengtongxue.com/admin/', 'https://example.com/', 'https://stock.mufengtongxue.com/?token=fixture']) {
    const result = await run([url]);
    assert.equal(result.calls.length, 2);
    assert.equal(result.exitCode, 1);
    assert.ok(!result.logs.join('').includes(key));
  }
});
test('ownership mismatch stops submission', async () => {
  const result = await run(['https://stock.mufengtongxue.com/'], 200, false);
  assert.equal(result.calls.length, 1);
  assert.equal(result.exitCode, 1);
});
