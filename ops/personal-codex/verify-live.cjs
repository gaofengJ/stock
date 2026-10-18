// Execute through stdin inside the existing backend container. Never prints tokens or environment values.
const fs = require('fs');
const crypto = require('crypto');
const env = require('dotenv').parse(fs.readFileSync(process.env.APP_ENV_FILE));
const mysql = require('mysql2/promise');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
(async () => {
  const db = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: env.DB_USERNAME, password: env.DB_PASSWORD, database: process.env.DB_DATABASE || process.env.DB_DATABASE_NAME || env.DB_DATABASE });
  let sessionId, otherSessionId, otherToken;
  const token = crypto.randomBytes(32).toString('hex'), csrf = hash(`csrf:${token}`);
  try {
    const [owner] = await db.query("SELECT id FROM t_user WHERE id=1 AND username='mufeng' AND is_active=1");
    if (owner.length !== 1) throw Error('owner_mismatch');
    const [result] = await db.query('INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (1,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND))', [hash(token), hash(csrf)]);
    sessionId = result.insertId;
    const base = 'http://stock-personal-console:8787';
    const get = async path => {
      const r = await fetch(base + path, { headers: { Cookie: `stock_session=${token}` }, signal: AbortSignal.timeout(15000) });
      return { status: r.status, body: await r.text(), frame: r.headers.get('x-frame-options'), csp: r.headers.get('content-security-policy') };
    };
    const checks = {};
    for (const path of ['/personal-ai/', '/personal-ai/app.js', '/personal-ai/style.css']) {
      const r = await get(path); checks[path] = r.status;
      if (r.status !== 200) throw Error('owner_page_access_failed');
    }
    const embedded = await get('/personal-ai/?embedded=1');
    if (embedded.status !== 200 || embedded.frame !== 'SAMEORIGIN' || !embedded.csp.includes("frame-ancestors 'self'")) throw Error('embedding_headers_failed');
    const anonymous = await fetch(base + '/personal-ai/?embedded=1');
    if (anonymous.status !== 401) throw Error('anonymous_not_blocked');
    const [others] = await db.query("SELECT u.id,EXISTS(SELECT 1 FROM t_user_role ur JOIN t_role r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.code='admin') is_admin FROM t_user u WHERE u.id<>1 AND u.is_active=1 ORDER BY is_admin DESC LIMIT 1");
    let otherAccountBlocked = null;
    if (others.length) {
      otherToken = crypto.randomBytes(32).toString('hex');
      const [created] = await db.query('INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 120 SECOND))', [others[0].id, hash(otherToken), hash(hash(`csrf:${otherToken}`))]);
      otherSessionId = created.insertId;
      const denied = await fetch(base + '/personal-ai/api/status', { headers: { Cookie: `stock_session=${otherToken}` } });
      if (denied.status !== 403) throw Error('other_account_not_blocked');
      otherAccountBlocked = { blocked: true, isAdmin: !!others[0].is_admin };
    }
    const before = await get('/personal-ai/api/status');
    if (before.status !== 200) throw Error('owner_status_failed');
    const state = JSON.parse(before.body);
    const headers = { Cookie: `stock_session=${token}`, Origin: 'https://14.103.103.4', 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
    const metaResponse = await fetch(base + '/personal-ai/api/account', { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(40000) });
    const meta = await metaResponse.json();
    if (metaResponse.status !== 200) throw Error(meta.error ? 'account_metadata_failed' : 'metadata_failed');
    const blocked = await fetch(base + '/personal-ai/api/tasks', { method: 'POST', headers: { ...headers, Origin: 'https://invalid.example' }, body: '{}', signal: AbortSignal.timeout(15000) });
    if (blocked.status !== 403) throw Error('csrf_origin_not_blocked');
    const after = JSON.parse((await get('/personal-ai/api/status')).body);
    if (JSON.stringify(after.tasks) !== JSON.stringify(state.tasks)) throw Error('unexpected_task_change');
    console.log(JSON.stringify({ ownerId: state.user.id, ownerUsername: state.user.username, pages: checks,
      authType: meta.authType, plan: meta.plan, models: meta.models, quota: meta.quota,
      taskCount: state.tasks.length, today: state.today, originBlocked: true, modelCalls: 0,
      sameOriginEmbedding: true, anonymousBlocked: true, otherAccountBlocked, taskStateUnchanged: true }));
  } finally {
    if (sessionId) await db.query('DELETE FROM t_auth_session WHERE id=? AND token_hash=?', [sessionId, hash(token)]);
    if (otherSessionId) await db.query('DELETE FROM t_auth_session WHERE id=? AND token_hash=?', [otherSessionId, hash(otherToken)]);
    await db.end();
  }
})().catch((e) => { const safe = /^(owner_mismatch|owner_page_access_failed|embedding_headers_failed|anonymous_not_blocked|other_account_not_blocked|owner_status_failed|account_metadata_failed|metadata_failed|csrf_origin_not_blocked|unexpected_task_change)$/.test(e.message) ? e.message : (e.code || e.name); console.log(JSON.stringify({ ok: false, error: safe })); process.exitCode = 1; });
