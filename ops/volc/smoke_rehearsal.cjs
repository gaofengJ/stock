/* Run on stdin inside the new backend container, after snapshot validation.
 * Creates and removes one isolated QA account. Never run the destructive CI
 * integration fixtures against a restored business database. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const localRequire = createRequire(process.cwd() + '/package.json');
const db = localRequire('./dist/migration-data-source').default;
const origin = 'https://14.103.103.4';
const username = 'migration_qa_' + crypto.randomBytes(6).toString('hex');
const password = crypto.randomBytes(24).toString('base64url');
const sessionHashes = new Set();
const results = [];
let cookie = '', csrf = '', userId;

async function request(path, { method = 'GET', body, status = 200, anonymous = false, noCsrf = false } = {}) {
  const headers = { Origin: origin };
  if (!anonymous && cookie) headers.Cookie = cookie;
  if (!anonymous && !noCsrf && csrf) headers['x-csrf-token'] = csrf;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch('http://127.0.0.1:3000/api' + path, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(65000),
  });
  assert.equal(response.status, status, method + ' ' + path + ' status');
  for (const setCookie of response.headers.getSetCookie()) {
    if (setCookie.startsWith('stock_session=') && !setCookie.startsWith('stock_session=;')) {
      assert.match(setCookie, /; Secure/i);
      assert.match(setCookie, /; HttpOnly/i);
      assert.match(setCookie, /; SameSite=Lax/i);
      cookie = setCookie.split(';')[0];
      sessionHashes.add(crypto.createHash('sha256').update(cookie.split('=')[1]).digest('hex'));
    }
  }
  const json = await response.json();
  if (status < 400) assert.equal(json.code, 0, method + ' ' + path + ' business code');
  if (json.data?.csrfToken) csrf = json.data.csrfToken;
  results.push({ method, path, status });
  return json.data;
}

async function main() {
  assert.equal(db.options.host, 'mysql');
  assert.equal(db.options.database, 'stock');
  assert.equal(db.options.synchronize, false);
  for (const key of ['SCHEDULE_ENABLED', 'SYNC_SCHEDULE_ENABLED', 'SYNC_ON_STARTUP',
    'NEWS_SYNC_ENABLED', 'ADMIN_JOBS_ENABLED', 'TUSHARE_REQUESTS_ENABLED']) {
    assert.equal(process.env[key], 'false', 'Rehearsal writer guard: ' + key);
  }
  await db.initialize();
  try {
    const [version] = await db.query('SELECT VERSION() version');
    assert.equal(version.version, '8.4.11');
    assert.equal((await db.query('SELECT id FROM t_user WHERE username=?', [username])).length, 0);
    await request('/auth/me', { status: 401, anonymous: true });
    await request('/auth/csrf');
    const registration = await request('/auth/register', {
      method: 'POST', status: 201, body: { username, password, nickname: '迁移验证临时账号' },
    });
    userId = registration.user.id;
    const [created] = await db.query('SELECT id,username FROM t_user WHERE id=?', [userId]);
    assert.equal(created.username, username);
    await request('/review/notebook?date=2026-09-28', { status: 403 });
    await db.query("INSERT INTO t_user_role(user_id,role_id) SELECT ?,id FROM t_role WHERE code='admin'", [userId]);
    const me = await request('/auth/me');
    assert.equal(me.id, userId);
    assert.ok(me.roles.some(role => role.code === 'admin'));
    const stocks = await request('/basic/stock/list?pageNum=1&pageSize=5');
    assert.ok(stocks.items?.length > 0, 'Nonempty stock list');
    const market = await request('/analysis/market/status');
    assert.match(market.latestDate, /^\d{4}-\d{2}-\d{2}$/, 'Restored market date available');
    const overview = await request('/analysis/market/overview?date=' + market.latestDate);
    assert.ok(overview.snapshot && overview.series?.length > 0, 'Nonempty restored market snapshot');
    const [{ date }] = await db.query("SELECT DATE_FORMAT(DATE_ADD(MAX(published_at),INTERVAL 8 HOUR),'%Y-%m-%d') date FROM t_news_item");
    assert.match(date, /^\d{4}-\d{2}-\d{2}$/);
    const news = await request('/news?pageSize=5&date=' + date);
    assert.ok(news.items?.length > 0, 'Nonempty restored news');
    await request('/news/' + news.items[0].id);
    await request('/admin/logs?pageSize=5&view=all');
    await request('/admin/access-logs?pageSize=5');
    await request('/admin/sync-jobs?pageSize=5');
    await request('/auth/blog-access');
    const articleAnonymous = await fetch('http://articles/', { signal: AbortSignal.timeout(10000) });
    assert.equal(articleAnonymous.status, 403, 'Article HTML is private');
    const article = await fetch('http://articles/', { headers: { Cookie: cookie }, signal: AbortSignal.timeout(10000) });
    assert.equal(article.status, 200);
    assert.match(await article.text(), /<html/i);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
    const content = {
      private: { execution: 'migration smoke private' }, public: { summary: 'migration smoke public' },
      article: { body: '# Migration smoke', feishuUrl: '', images: [{ id: 'one', data: png, caption: 'QA', source: '', after: '' }] },
    };
    const note = { date: '2026-09-28', revision: 0, content: JSON.stringify(content) };
    await request('/review/notebook', { method: 'POST', body: note, status: 403, noCsrf: true });
    await request('/review/notebook', { method: 'POST', body: note, status: 201 });
    await request('/review/notebook', { method: 'POST', body: note, status: 409 });
    const read = await request('/review/notebook?date=2026-09-28');
    assert.equal(read.revision, 1);
    assert.equal(read.content.private.execution, content.private.execution);
    assert.equal(read.content.article.images[0].data, png);
    const [image] = await db.query('SELECT COUNT(*) n FROM t_review_image WHERE user_id=?', [userId]);
    assert.equal(Number(image.n), 1);
    await request('/auth/logout', { method: 'POST', status: 201 });
    await request('/auth/me', { status: 401 });
    cookie = ''; csrf = '';
    await request('/auth/csrf');
    const login = await request('/auth/login', { method: 'POST', status: 201, body: { username, password } });
    assert.equal(login.user.id, userId);
    await request('/auth/logout', { method: 'POST', status: 201 });
  } finally {
    // Only the unique account created by this invocation, and its own sessions.
    // A failed registration response can still have committed; resolve by the
    // collision-checked random username before attempting owner-scoped cleanup.
    const rows = await db.query('SELECT id FROM t_user WHERE username=?', [username]);
    if (rows.length) {
      assert.equal(rows.length, 1);
      userId = rows[0].id;
      await db.transaction(async manager => {
        await manager.query('DELETE FROM t_auth_audit WHERE actor_id=?', [userId]);
        await manager.query('DELETE FROM t_user_role WHERE user_id=?', [userId]);
        await manager.query('DELETE FROM t_user WHERE id=? AND username=?', [userId, username]);
      });
    }
    for (const hash of sessionHashes) await db.query('DELETE FROM t_auth_session WHERE token_hash=?', [hash]);
    assert.equal((await db.query('SELECT id FROM t_user WHERE username=?', [username])).length, 0);
    await db.destroy();
  }
  console.log(JSON.stringify({ state: 'rehearsal-api-verified', checks: results,
    articlesPrivate: true, notebookImageRoundTrip: true, qaAccountRemoved: true,
    productionEnabled: false }));
}
// The imported application logger owns a timer. Finish only after main's
// awaited cleanup, then exit this one-shot verifier without waiting for it.
main().then(() => process.exit(0)).catch(error => {
  console.error(JSON.stringify({ error: error.message, completedChecks: results }));
  process.exit(1);
});
