const assert = require('node:assert/strict');
const { JobsService } = require('../dist/modules/admin/jobs.service');
const { LogsService } = require('../dist/modules/admin/logs.service');

module.exports = async ({ db, auth, admin, locks }) => {
  const forbidden = error => error.status === 403;
  const register = async username => {
    const { id } = await auth.register({ username, password: 'isolated-test-password' });
    return auth.current(id);
  };
  const role = await auth.saveRole(admin, null, { code: 'delegated_admin', name: 'Delegated admin', permissions: ['users:manage', 'roles:manage', 'strategy:read'] });
  const delegated = await register('delegated_fixture');
  const ordinary = await register('ordinary_fixture');
  await auth.updateUser(admin, delegated.id, { roleIds: [role.id] });
  const actor = await auth.current(delegated.id);
  const adminRole = admin.roles.find(r => r.code === 'admin').id;
  await assert.rejects(auth.updateUser(actor, actor.id, { roleIds: [adminRole] }), forbidden);
  await assert.rejects(auth.updateUser(actor, ordinary.id, { roleIds: [adminRole] }), forbidden);
  await assert.rejects(auth.updateUser(actor, admin.id, { active: false }), forbidden);
  await assert.rejects(auth.resetPassword(actor, admin.id, 'blocked-reset-password'), forbidden);
  await assert.rejects(auth.saveRole(actor, null, { code: 'escalated', name: 'Escalated', permissions: ['data:write'] }), forbidden);
  await assert.rejects(auth.saveRole(actor, role.id, { code: 'delegated_admin', name: 'Self change', permissions: ['strategy:read'] }), forbidden);
  const privileged = await auth.saveRole(admin, null, { code: 'privileged_other', name: 'Other privileged role', permissions: ['logs:read'] });
  await assert.rejects(auth.saveRole(actor, privileged.id, { code: 'privileged_other', name: 'Changed', permissions: [] }), forbidden);
  await assert.rejects(auth.deleteRole(actor, privileged.id), forbidden);
  const business = await auth.saveRole(actor, null, { code: 'business_reader', name: 'Business reader', permissions: ['strategy:read'] });
  await auth.updateUser(actor, ordinary.id, { roleIds: [business.id], nickname: 'Allowed' });
  await auth.resetPassword(actor, ordinary.id, 'ordinary-reset-password');
  assert.equal((await db.query('SELECT nickname FROM t_user WHERE id=?', [ordinary.id]))[0].nickname, 'Allowed');
  await auth.updateUser(admin, actor.id, { roleIds: [business.id] });
  await assert.rejects(auth.saveRole(actor, null, { code: 'stale_actor', name: 'Stale', permissions: [] }), forbidden);

  // Use the real MySQL state transitions and lock service with a controllable source.
  await db.query("UPDATE t_admin_job SET status='cancelled',active_key=NULL WHERE status IN ('queued','pending')");
  const complete = { completed: ['2026-02-02'], failures: [], protectedDates: [], remaining: 0 };
  const source = { marketEnabled: true, marketBatch: async () => complete };
  const jobs = new JobsService(db, source, auth, locks);
  const state = async id => (await db.query('SELECT * FROM t_admin_job WHERE id=?', [id]))[0];
  const create = (date = '2026-02-02') => jobs.create(admin, date, date);
  const paused = await create();
  await jobs.control(admin, paused.id, 'pause');
  assert.equal((await state(paused.id)).status, 'paused');
  await jobs.tick();
  assert.equal((await state(paused.id)).status, 'paused');
  await jobs.control(admin, paused.id, 'retry');
  await jobs.tick();
  assert.equal((await state(paused.id)).status, 'success');

  const pending = await create();
  source.marketBatch = async () => { throw new Error('upstream unavailable'); };
  await jobs.tick();
  assert.equal((await state(pending.id)).status, 'pending');
  assert.equal((await state(pending.id)).retry_count, 1);
  assert.ok((await state(pending.id)).next_retry_at > new Date());
  assert.equal((await create()).id, pending.id);
  await jobs.control(admin, pending.id, 'retry');
  assert.equal((await state(pending.id)).status, 'queued');
  assert.equal((await state(pending.id)).next_retry_at, null);
  assert.equal((await state(pending.id)).retry_count, 0);
  source.marketBatch = async () => complete;
  await jobs.tick();
  assert.equal((await state(pending.id)).status, 'success');

  for (const action of ['pause', 'cancel']) {
    const job = await create();
    let release;
    let entered;
    const started = new Promise(resolve => { entered = resolve; });
    source.marketBatch = () => { entered(); return new Promise(resolve => { release = resolve; }); };
    const tick = jobs.tick();
    await started;
    await jobs.control(admin, job.id, action);
    assert.equal((await state(job.id)).status, action === 'pause' ? 'pausing' : 'cancelling');
    assert.equal((await create()).id, job.id, 'Active key is retained until the batch stops');
    release(complete);
    await tick;
    const stopped = await state(job.id);
    assert.equal(stopped.status, action === 'pause' ? 'paused' : 'cancelled');
    assert.ok(JSON.stringify(stopped.completed_dates).includes('2026-02-02'));
    if (action === 'pause') await jobs.control(admin, job.id, 'cancel');
    else await assert.rejects(jobs.control(admin, job.id, 'retry'), error => error.status === 409);
  }

  const failing = await create();
  source.marketBatch = async () => { throw new Error('repeated upstream failure'); };
  for (let i = 0; i < 5; i += 1) {
    await db.query('UPDATE t_admin_job SET next_retry_at=DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 SECOND) WHERE id=?', [failing.id]);
    await jobs.tick();
  }
  const exhausted = await state(failing.id);
  assert.equal(exhausted.status, 'failed');
  assert.equal(exhausted.retry_count, 5);
  assert.equal(exhausted.active_key, null);
  assert.equal(exhausted.next_retry_at, null);
  assert.ok(exhausted.finished_at);
  const duplicate = await create();
  await assert.rejects(jobs.control(admin, failing.id, 'retry'), error => error.status === 409);
  await jobs.control(admin, duplicate.id, 'cancel');
  await jobs.control(admin, failing.id, 'retry');
  assert.equal((await state(failing.id)).status, 'queued');
  await jobs.control(admin, failing.id, 'cancel');

  const pausedAtRestart = await create('2026-02-03');
  const cancelledAtRestart = await create('2026-02-04');
  await db.query("UPDATE t_admin_job SET status='pausing' WHERE id=?", [pausedAtRestart.id]);
  await db.query("UPDATE t_admin_job SET status='cancelling' WHERE id=?", [cancelledAtRestart.id]);
  await jobs.onApplicationBootstrap();
  assert.equal((await state(pausedAtRestart.id)).status, 'paused');
  assert.equal((await state(cancelledAtRestart.id)).status, 'cancelled');
  assert.equal((await state(cancelledAtRestart.id)).active_key, null);
  await jobs.control(admin, pausedAtRestart.id, 'cancel');

  const permanent = await create();
  source.marketBatch = async () => { throw new Error('permanent: fixture permission denied'); };
  await jobs.tick();
  assert.equal((await state(permanent.id)).status, 'failed');
  assert.equal((await state(permanent.id)).retry_count, 1);
  assert.equal((await state(permanent.id)).next_retry_at, null);

  await db.query("INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,mode) VALUES(NULL,'自动测试','2026-02-02','2026-02-02','success','missing')");
  await auth.audit(null, 'sync.scheduled', null, 'success');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  const logs = new LogsService(db);
  logs.application = () => { throw new Error('Job statistics must not read log files'); };
  const summary = await logs.stats({ startDate: today, endDate: today, page: 1, pageSize: 20 });
  assert.equal(Number(summary.sync.find(r => r.source === 'scheduled').count), 1);
  assert.equal(summary.sync.reduce((n, row) => n + Number(row.count), 0), Number((await db.query('SELECT COUNT(*) n FROM t_admin_job'))[0].n), 'Count jobs once, without also counting invocation audit events');
  console.info('PASS: delegated authorization boundaries, immediate retry, pause/cancel races, retry limit, duplicate ranges and task statistics.');
};
