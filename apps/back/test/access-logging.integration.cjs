/* Executed only by accounts.integration.cjs against its disposable local database. */
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { APP_GUARD, Reflector } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const { ValidationPipe } = require('@nestjs/common');
const { AdminController } = require('../dist/modules/admin/admin.controller');
const { LogsService } = require('../dist/modules/admin/logs.service');
const { JobsService } = require('../dist/modules/admin/jobs.service');
const { AuthGuard } = require('../dist/modules/auth/auth.guard');
const { TransformInterceptor } = require('../dist/interceptors/transform.interceptor');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');

module.exports = async function verifyAccessLogging({ db, auth, inject, admin, user, entries }) {
  const match = response => entries.find(e => e.requestId === response.headers['x-request-id']);
  const denied = await inject('GET', '/admin/users', undefined, user);
  assert.equal(denied.statusCode, 403);
  assert.equal(match(denied).username, 'alice');
  assert.equal(match(denied).statusCode, 403);
  const missing = await inject('GET', '/auth/me');
  assert.equal(missing.statusCode, 401);
  assert.equal(match(missing).actorType, 'anonymous');
  const badInput = await inject('PATCH', '/users/me', { nickname: {} }, user);
  assert.equal(badInput.statusCode, 400);
  assert.equal(match(badInput).username, 'alice');
  const replies = await Promise.all(Array.from({ length: 8 }, (_, i) => inject('GET', '/auth/me', undefined, i % 2 ? admin : user, { 'x-request-id': 'spoofed', 'x-forwarded-for': '203.0.113.99' })));
  replies.forEach((response, i) => {
    assert.equal(response.statusCode, 200);
    assert.match(response.headers['x-request-id'], /^[a-f0-9-]{36}$/);
    assert.equal(match(response).username, i % 2 ? 'mufeng' : 'alice');
    assert.notEqual(match(response).ip, '203.0.113.99', 'Untrusted forwarding headers do not control recorded IP');
  });
  assert(entries.some(e => e.path === '/api/auth/login' && e.actorType === 'user' && e.username === 'alice'), 'Successful login is associated with the verified account');
  const change = await inject('PATCH', '/admin/users/' + user.user.id, { nickname: user.user.nickname }, admin);
  assert.equal(change.statusCode, 200, change.body);
  const requestId = change.headers['x-request-id'];
  const audit = await db.query('SELECT detail FROM t_auth_audit WHERE action=? AND target=? ORDER BY id DESC LIMIT 1', ['user.update', String(user.user.id)]);
  assert.equal(JSON.parse(audit[0].detail).requestId, requestId);
  const serialized = JSON.stringify(entries);
  for (const sensitive of ['test-password-123', 'stock_session=', admin.csrf, user.csrf]) assert(!serialized.includes(sensitive), 'Credentials never enter access metadata');
  const oldDirectory = process.env.LOG_DIR;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'access-http-'));
  process.env.LOG_DIR = directory;
  let app;
  try {
    for (const date of new Set(entries.map(e => e.timestamp.slice(0, 10)))) await fs.writeFile(path.join(directory, 'stock-access.' + date + '.log'), entries.filter(e => e.timestamp.startsWith(date)).map(e => JSON.stringify(e)).join('\n'));
    const logs = new LogsService(db);
    const module = await Test.createTestingModule({ controllers: [AdminController], providers: [
      { provide: JobsService, useValue: {} }, { provide: LogsService, useValue: logs },
      { provide: APP_GUARD, useValue: new AuthGuard(new Reflector(), auth) },
    ] }).compile();
    const adapter = new FastifyAdapter(); await adapter.register(require('@fastify/cookie'));
    app = module.createNestApplication(adapter, { logger: false });
    app.setGlobalPrefix('api'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalInterceptors(new TransformInterceptor(new Reflector()));
    await app.init(); await adapter.getInstance().ready();
    const get = (query = '', client = admin) => app.inject({ method: 'GET', url: '/api/admin/access-logs?' + query, headers: client.cookie ? { cookie: client.cookie } : {} });
    assert.equal((await get('', {})).statusCode, 401);
    assert.equal((await get('', user)).statusCode, 403);
    const all = await get('pageSize=100'); assert.equal(all.statusCode, 200, all.body);
    assert.equal(all.json().data.total, entries.length);
    const filtered = await get('user=alice&result=failed');
    assert(filtered.json().data.total >= 2);
    assert(filtered.json().data.items.every(e => e.username === 'alice' && e.statusCode >= 400));
    const single = (await get('requestId=' + requestId)).json().data;
    assert.equal(single.total, 1); assert.equal(single.items[0].userId, admin.user.id);
    const linked = await app.inject({ method: 'GET', url: '/api/admin/audit-logs?requestId=' + requestId, headers: { cookie: admin.cookie } });
    assert.equal(linked.statusCode, 200); assert(linked.json().data.items.some(e => e.action === 'user.update'));
    for (const invalid of ['method=TRACE', 'result=unknown', 'slow=2', 'requestId=bad', 'actorType=system', 'pageSize=101', 'unexpected=1', 'startDate=2026-02-30', 'startDate=2026-10-01&endDate=2026-10-08']) assert.equal((await get(invalid)).statusCode, 400, invalid);
    console.info('PASS: real session identities, guard/validation failures, server-generated request IDs, concurrent users, audit correlation, access query authorization and validation, credential omission.');
  } finally {
    if (app) await app.close();
    if (oldDirectory === undefined) delete process.env.LOG_DIR; else process.env.LOG_DIR = oldDirectory;
    await fs.rm(directory, { recursive: true, force: true });
  }
};
