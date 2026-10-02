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
            resolve();
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
    await check('/api/admin/users?pageSize=1', cookie);
    await check('/api/admin/sync-jobs?pageSize=1', cookie);
    await check('/api/admin/logs?pageSize=1', cookie);
    await check('/api/analysis/market/intraday-counts?days=10', cookie);
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
