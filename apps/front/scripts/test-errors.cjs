const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const axios = require('axios');

// 直接执行项目中的请求代码；不依赖后端、登录账号或额外测试包。
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '../src', relative);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const resolve = (name) => {
    if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), `${name}.ts`)));
    return require(name);
  };
  new Function('require', 'module', 'exports', source)(resolve, module, module.exports);
  return module.exports;
}
const { errorMessage, readApiResponse } = load('api/errors.ts');
const client = load('auth/client.ts');
const register = load('api/interceptors.ts').default;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

for (const [name, response, expected] of [
  ['纯文本服务错误', () => new Response('Internal Server Error', { status: 500 }), '服务出现异常，请稍后重试'],
  ['网关错误页', () => new Response('<html>Bad Gateway</html>', { status: 502 }), '暂时无法连接服务，请稍后重试'],
  ['成功状态但无效格式', () => new Response('not json'), '服务返回的数据格式异常，请稍后重试'],
  ['空响应', () => new Response(null, { status: 204 }), '服务返回的数据格式异常，请稍后重试'],
  ['空对象', () => json({}), '服务返回的数据格式异常，请稍后重试'],
  ['空值', () => json(null), '服务返回的数据格式异常，请稍后重试'],
  ['未登录纯文本', () => new Response('Unauthorized', { status: 401 }), '登录状态已失效，请重新登录'],
  ['默认英文校验', () => json({ message: ['password must be a string'] }, 422), '填写的信息有误，请检查后重试'],
  ['中文业务错误', () => json({ message: '账号或密码错误' }, 401), '账号或密码错误'],
  ['成功状态下的业务失败', () => json({ code: -403, message: '权限不足', data: null }), '权限不足'],
]) {
  test(`响应解析：${name}`, async () => {
    await assert.rejects(readApiResponse(response()), { message: expected });
  });
}
test('成功响应正常返回', async () => {
  assert.deepEqual(await readApiResponse(json({ code: 0, data: { ok: true } })), { code: 0, data: { ok: true } });
});
test('网络、超时、未知异常和中文提示分类', () => {
  assert.equal(errorMessage(new TypeError('Failed to fetch')), '网络连接失败，请检查网络后重试');
  assert.equal(errorMessage({ code: 'ECONNABORTED', message: 'timeout of 30000ms exceeded' }), '请求超时，请稍后重试');
  assert.equal(errorMessage(new SyntaxError('Unexpected token I')), '服务返回的数据格式异常，请稍后重试');
  assert.equal(errorMessage(new Error('Unexpected failure')), '操作失败，请稍后重试');
  assert.equal(errorMessage('数据库异常 SELECT * FROM users'), '操作失败，请稍后重试');
  assert.equal(errorMessage('请选择交易日期'), '请选择交易日期');
});
test('登录请求及安全会话失败都返回中文，失败不会污染缓存', async () => {
  const original = global.fetch;
  client.clearCredential();
  try {
    global.fetch = async () => new Response('Internal Server Error', { status: 500 });
    await assert.rejects(client.api('/auth/login', 'POST', {}), { message: '服务出现异常，请稍后重试' });
    global.fetch = async () => json({ code: 0, data: {} });
    await assert.rejects(client.csrfToken(), { message: '无法建立安全会话，请刷新页面后重试' });
    global.fetch = async (url) => url.endsWith('/csrf')
      ? json({ code: 0, data: { csrfToken: 'test-only' } })
      : json({ code: 0, data: { id: 1 } });
    assert.deepEqual(await client.api('/auth/login', 'POST', {}), { id: 1 });
    global.fetch = async () => { throw new TypeError('Failed to fetch'); };
    await assert.rejects(client.api('/auth/me'), { message: '网络连接失败，请检查网络后重试' });
  } finally { global.fetch = original; client.clearCredential(); }
});
test('非 JSON 未登录响应仍触发登录失效通知', async () => {
  const original = global.fetch;
  const originalWindow = global.window;
  const originalEvent = global.CustomEvent;
  const events = [];
  global.CustomEvent = class extends Event {
    constructor(type, options) { super(type); this.detail = options.detail; }
  };
  global.window = { dispatchEvent: (event) => events.push(event.detail) };
  try {
    global.fetch = async () => new Response('Unauthorized', { status: 401 });
    await assert.rejects(client.api('/auth/me'), { message: '登录状态已失效，请重新登录' });
    assert.deepEqual(events, [401]);
  } finally { global.fetch = original; global.window = originalWindow; global.CustomEvent = originalEvent; }
});

function setup(adapter) {
  const messages = [];
  const ctx = {
    requestMap: new Map(),
    getUrlKey: (method, url, key) => `${method}-${url}-${key || ''}`,
    showBizError: (message, config) => { if (config?.autoShowError) messages.push(message); },
  };
  const instance = axios.create({ adapter });
  register(ctx, instance);
  return { instance, messages, ctx };
}
for (const [name, data, expected] of [
  ['纯文本成功响应', 'Internal Server Error', '服务返回的数据格式异常，请稍后重试'],
  ['空响应', null, '服务返回的数据格式异常，请稍后重试'],
  ['业务错误对象', { code: -500, message: 'Internal error', data: null }, '操作失败，请稍后重试'],
  ['中文业务错误', { code: -403, message: '暂无访问权限', data: null }, '暂无访问权限'],
  ['下载中的无效 JSON', new Blob(['invalid'], { type: 'application/json; charset=utf-8' }), '服务返回的数据格式异常，请稍后重试'],
  ['下载中的网关错误页', new Blob(['<html>Bad Gateway</html>'], { type: 'text/html' }), '服务返回的数据格式异常，请稍后重试'],
]) {
  test(`业务请求：${name}`, async () => {
    const { instance, messages } = setup(async (config) => ({ config, data, status: 200, headers: {} }));
    await assert.rejects(instance.get('/test', { autoShowError: true }), { message: expected });
    assert.deepEqual(messages, [expected]);
  });
}
test('业务请求的 HTTP 失败既显示中文，也向调用方抛出中文异常', async () => {
  const { instance, messages } = setup(async (config) => {
    throw new axios.AxiosError('Request failed with status code 503', 'ERR_BAD_RESPONSE', config, null, { config, status: 503, data: 'Service Unavailable' });
  });
  await assert.rejects(instance.get('/test', { autoShowError: true }), (error) => {
    assert.equal(error.message, '服务暂时不可用，请稍后重试');
    assert.equal(error.response.status, 503);
    return true;
  });
  assert.deepEqual(messages, ['服务暂时不可用，请稍后重试']);
});
test('取消请求保持取消语义且不弹错，清理对应并发记录', async () => {
  const { instance, messages, ctx } = setup(async (config) => { throw new axios.CanceledError('canceled', config); });
  await assert.rejects(instance.get('/test', { race: true, autoShowError: true }), axios.isCancel);
  assert.deepEqual(messages, []);
  assert.equal(ctx.requestMap.size, 0);
});
test('正常数据及文件下载保留原有返回结构', async () => {
  const body = { code: 0, data: [1, 2] };
  const { instance } = setup(async (config) => ({ config, status: 200, data: body, headers: {} }));
  assert.deepEqual((await instance.get('/test')).data, body);
  const blob = new Blob(['file'], { type: 'application/octet-stream' });
  const download = setup(async (config) => ({ config, status: 200, data: blob, headers: {} }));
  assert.equal((await download.instance.get('/file', { responseType: 'blob' })).data, blob);
  const csv = new Blob(['name,value\n测试,1'], { type: 'text/csv' });
  const textDownload = setup(async (config) => ({ config, status: 200, data: csv, headers: {} }));
  assert.equal((await textDownload.instance.get('/file', { responseType: 'blob' })).data, csv);
});
