const http = require('http');
const { randomBytes, createHash } = require('crypto');
const digest = (value) => createHash('sha256').update(value).digest('hex');
async function check(path, cookie, needsRows = false, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: Number(process.env.APP_PORT || 3000),
        path,
        headers: cookie ? { Cookie: cookie } : {},
        timeout: 5000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const body = JSON.parse(data);
            if (
              res.statusCode !== expectedStatus ||
              (expectedStatus === 200 && body.code !== 0) ||
              (needsRows && !body.data?.items?.length)
            )
              throw new Error('API check failed: ' + path);
            resolve(body.data);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('API check timeout')));
    req.on('error', reject);
  });
}
(async () => {
  const ds = require('../../dist/migration-data-source').default;
  await ds.initialize();
  const token = randomBytes(32).toString('hex');
  const hash = digest(token);
  const cookie = 'stock_session=' + token;
  try {
    const [row] = await ds.query(
      "SELECT DATE_FORMAT(MAX(trade_date),'%Y-%m-%d') date FROM t_source_daily",
    );
    const date = row.date;
    if (!date)
      throw new Error('No market data available for release verification');
    const [admin] = await ds.query(
      "SELECT u.id FROM t_user u JOIN t_user_role ur ON ur.user_id=u.id JOIN t_role r ON r.id=ur.role_id WHERE r.code='admin' AND u.is_active=1 AND u.must_change_password=0 LIMIT 1",
    );
    if (!admin)
      throw new Error('No active administrator for release verification');
    await ds.query(
      'INSERT INTO t_auth_session(user_id,token_hash,csrf_hash,last_seen_at,expires_at) VALUES (?,?,?,UTC_TIMESTAMP(6),DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 5 MINUTE))',
      [admin.id, hash, digest(digest('csrf:' + token))],
    );
    await check('/api/auth/me', cookie);
    const playbook = await check('/api/admin/playbook', cookie);
    if (playbook?.maps?.length !== 4) throw new Error('Private playbook configuration check failed');
    await check('/api/admin/playbook', null, false, 401);
    await check('/api/basic/trade-cal/list?year=' + date.slice(0, 4), cookie);
    await check(
      '/api/source/daily/list?pageNum=1&pageSize=1&tradeDate=' + date,
      cookie,
      true,
    );
    await check(
      '/api/analysis/senti/list?startDate=' + date + '&endDate=' + date,
      cookie,
    );
    const users = await check('/api/admin/users?pageSize=1', cookie);
    if (users.page !== 1 || users.pageSize !== 1 || users.activeAdminCount < 1)
      throw new Error('User list metadata verification failed');
    const [adminRole] = await ds.query(
      "SELECT id FROM t_role WHERE code='admin'",
    );
    const filtered = await check(
      '/api/admin/users?pageSize=1&active=1&roleId=' + adminRole.id,
      cookie,
      true,
    );
    if (
      !filtered.items.every(
        (user) =>
          user.active && user.roles.some((role) => role.code === 'admin'),
      )
    )
      throw new Error('User role/status filter verification failed');
    await check('/api/admin/login-activity?pageSize=1', cookie);
    const roles = await check('/api/admin/roles', cookie);
    if (
      !Array.isArray(roles) ||
      !roles.length ||
      !roles.every(
        (role) =>
          /^[a-f0-9]{64}$/.test(role.revision) &&
          role.users.every(
            (user) =>
              typeof user.username === 'string' &&
              typeof user.nickname === 'string' &&
              typeof user.active === 'boolean',
          ),
      )
    )
      throw new Error('Role revision and member metadata verification failed');
    await check('/api/admin/login-activity?pageSize=1&status=unread', cookie);
    const jobs = await check('/api/admin/sync-jobs?pageSize=1', cookie);
    if (
      jobs.page !== 1 ||
      jobs.maxFailures !== 5 ||
      !jobs.summary ||
      !jobs.items.every((job) => job.actorId === null || typeof job.actorId === 'number')
    )
      throw new Error('Sync task overview and source metadata verification failed');
    const pendingJobs = await check('/api/admin/sync-jobs?pageSize=1&status=pending', cookie);
    if (!pendingJobs.items.every((job) => job.status === 'pending'))
      throw new Error('Sync task status filter verification failed');
    await check('/api/admin/logs?pageSize=1', cookie);
    const access = await check('/api/admin/access-logs?pageSize=10&user=' + admin.id + '&path=' + encodeURIComponent('/api/auth/me'), cookie);
    if (
      access.retentionDays !== 30 ||
      typeof access.summary?.requests !== 'number' ||
      !access.items.some(entry => entry.userId === admin.id && entry.actorType === 'user' && entry.statusCode === 200 && /^[a-f0-9-]{36}$/.test(entry.requestId) && typeof entry.durationMs === 'number')
    ) throw new Error('Authenticated API access logging verification failed');
    await check('/api/analysis/market/intraday-counts?days=10', cookie);
    const themes = await check('/api/analysis/market/theme-review?date=' + date, cookie);
    if (!Array.isArray(themes.groups) || !Array.isArray(themes.sources) ||
        themes.total !== themes.groups.reduce((sum, group) => sum + group.items.length, 0))
      throw new Error('Theme review grouping verification failed');
    if (themes.sources.some(source => source.source !== 'ths_hot_review'))
      throw new Error('Theme review must use the official THS source');
    const themeStock = themes.groups.flatMap(group => group.items)[0];
    if (themeStock) {
      const detail = await check('/api/analysis/market/theme-review-detail?date=' + date + '&code=' + themeStock.tsCode, cookie);
      if (detail.stock.tsCode !== themeStock.tsCode || !Array.isArray(detail.announcements) ||
          detail.announcements.some(notice => notice.date > date) ||
          (detail.financial && detail.financial.announcedAt > date))
        throw new Error('Theme review historical detail verification failed');
    }
    await check('/api/analysis/market/theme-review?date=' + date, null, false, 401);
    await check(
      '/api/basic/trade-cal/list?year=' + date.slice(0, 4),
      null,
      false,
      401,
    );
  } finally {
    try {
      await ds.query('DELETE FROM t_auth_session WHERE token_hash=?', [hash]);
    } finally {
      await ds.destroy();
    }
  }
})().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
