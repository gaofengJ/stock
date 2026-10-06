const assert = require('node:assert/strict');
const { randomBytes, createHash } = require('node:crypto');
const digest = value => createHash('sha256').update(value).digest('hex');
(async () => {
  const db = require(process.cwd() + '/dist/migration-data-source').default;
  await db.initialize();
  const token = randomBytes(32).toString('hex');
  const hash = digest(token);
  try {
    const [admin] = await db.query("SELECT u.id FROM t_user u JOIN t_user_role ur ON ur.user_id=u.id JOIN t_role r ON r.id=ur.role_id WHERE r.code='admin' AND u.is_active=1 AND u.must_change_password=0 LIMIT 1");
    assert.ok(admin);
    await db.query('INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE))', [admin.id, hash, digest(digest('csrf:' + token))]);
    const base = 'http://127.0.0.1:' + (process.env.APP_PORT || 3000);
    const response = await fetch(base + '/api/admin/playbook', {headers: {Cookie: 'stock_session=' + token}, signal: AbortSignal.timeout(10000)});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.equal(body.data.version, process.env.PLAYBOOK_VERSION);
    assert.equal(digest(JSON.stringify(body.data)), process.env.PLAYBOOK_SHA256);
    const rejected = await fetch(base + '/api/admin/playbook', {signal: AbortSignal.timeout(10000)});
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get('cache-control'), 'no-store');
    console.log('Private guide content and authorization verified');
  } finally {
    await db.query('DELETE FROM t_auth_session WHERE token_hash=?', [hash]);
    await db.destroy();
  }
})().catch(() => { console.error('Private guide verification failed'); process.exitCode = 1; });
