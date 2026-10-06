const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { APP_GUARD, Reflector } = require('@nestjs/core');
const { FastifyAdapter } = require('@nestjs/platform-fastify');
const { AdminController } = require('../dist/modules/admin/admin.controller');
const { JobsService } = require('../dist/modules/admin/jobs.service');
const { LogsService } = require('../dist/modules/admin/logs.service');
const { AuthGuard } = require('../dist/modules/auth/auth.guard');
const { TransformInterceptor } = require('../dist/interceptors/transform.interceptor');

module.exports = async function verifySyncManagement({ db, auth, admin, user }) {
  const jobs = new JobsService(db, {}, auth, {});
  const routes = { list: jobs.list.bind(jobs), detail: jobs.detail.bind(jobs), create: jobs.create.bind(jobs), control: jobs.control.bind(jobs) };
  const module = await Test.createTestingModule({ controllers: [AdminController], providers: [
    { provide: JobsService, useValue: routes }, { provide: LogsService, useValue: {} },
    { provide: APP_GUARD, useValue: new AuthGuard(new Reflector(), auth) },
  ] }).compile();
  const adapter = new FastifyAdapter();
  await adapter.register(require('@fastify/cookie'));
  const app = module.createNestApplication(adapter, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, transformOptions: { enableImplicitConversion: true } }));
  app.useGlobalInterceptors(new TransformInterceptor(new Reflector()));
  const ids = [];
  const get = async (query = '', client = admin) => app.inject({ method: 'GET', url: '/api/admin/sync-jobs?' + query, headers: client.cookie ? { cookie: client.cookie } : {} });
  const read = async query => { const r = await get(query); assert.equal(r.statusCode, 200, r.body); return r.json().data; };
  try {
    await app.init(); await adapter.getInstance().ready();
    const baseline = await read('pageSize=100');
    for (const [status, mode, name, actorId, start, end] of [
      ['pending', 'hot', 'sync_%fixture', null, '2024-01-30', '2026-09-30'],
      ['pending', 'breadth', 'sync_ABfixture', null, '2026-10-01', '2026-10-06'],
      ['failed', 'hot', 'sync_failed_fixture', null, '2026-09-01', '2026-09-30'],
      ['success', 'technical', 'sync_human_fixture', admin.user.id, '2026-09-30', '2026-09-30'],
      ['running', 'missing', 'sync_running_fixture', null, '2026-09-30', '2026-10-06'],
      ['paused', 'refresh', 'sync_paused_fixture', admin.user.id, '2026-01-01', '2026-02-01'],
    ]) {
      const inserted = await db.query("INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,mode,stage,retry_count,error) VALUES(?,?,?,?,?,?,'fixture',?,?)", [actorId, name, start, end, status, mode, status === 'pending' ? 4 : 0, status === 'pending' ? '上游服务暂不可用' : null]);
      ids.push(inserted.insertId);
    }
    const all = await read('keyword=sync_&pageSize=100');
    assert.equal(all.total, 6); assert.equal(all.maxFailures, 5);
    assert.equal(all.summary.pending, (baseline.summary.pending || 0) + 2);
    assert.equal(Object.values(all.summary).reduce((a, n) => a + n, 0), baseline.total + 6);
    assert.equal(all.items.find(r => r.id === ids[0]).actorId, null);
    assert.equal(all.items.find(r => r.id === ids[3]).actorId, admin.user.id);
    assert.ok(all.items.every(r => /^\d{4}-\d{2}-\d{2}T/.test(r.createdAt)));
    const literal = await read('keyword=' + encodeURIComponent('sync_%fixture'));
    assert.deepEqual(literal.items.map(r => r.id), [ids[0]], 'Search wildcards are literal');
    const filtered = await read('status=pending&mode=hot&startDate=2026-09-30&endDate=2026-10-01');
    assert.equal(filtered.total, 1); assert.equal(filtered.items[0].id, ids[0]);
    assert.deepEqual(filtered.summary, all.summary, 'Overview is global, not the filtered page');
    const past = await read('keyword=sync_&startDate=2020-01-01&endDate=2026-10-06');
    assert.equal(past.total, 6, 'History filters can cover more than two years');
    const paged = await read('keyword=sync_&pageSize=2&page=99');
    assert.equal(paged.page, 3); assert.equal(paged.items.length, 2);
    assert.deepEqual(paged.items.map(r => r.id), ids.slice(0, 2).reverse());
    assert.equal((await read('keyword=' + ids[2])).items[0].id, ids[2]);
    for (const query of ['status=unknown', 'mode=unknown', 'pageSize=101', 'startDate=2026-10-01', 'startDate=2026-02-30&endDate=2026-03-01', 'startDate=2026-10-06&endDate=2026-10-01', 'startDate[]=2026-10-01&endDate=2026-10-06', 'unexpected=1']) {
      assert.equal((await get(query)).statusCode, 400, query);
    }
    assert.equal((await get('', {})).statusCode, 401);
    assert.equal((await get('', user)).statusCode, 403);
    console.info('PASS: sync filters, literal search, inclusive date overlap, global overview, source metadata, timestamps, pagination clamping, query validation and authorization.');
  } finally {
    if (ids.length) await db.query(`DELETE FROM t_admin_job WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    await app.close();
  }
};
