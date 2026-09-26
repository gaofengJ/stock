const http = require('http');
async function check(path, needsRows = false) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: '127.0.0.1',
        port: Number(process.env.APP_PORT || 3000),
        path,
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
              res.statusCode !== 200 ||
              body.code !== 0 ||
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
  let date;
  try {
    const [row] = await ds.query(
      "SELECT DATE_FORMAT(MAX(trade_date),'%Y-%m-%d') date FROM t_source_daily",
    );
    date = row.date;
  } finally {
    await ds.destroy();
  }
  if (!date)
    throw new Error('No market data available for release verification');
  await check('/api/basic/trade-cal/list?year=' + date.slice(0, 4));
  await check(
    '/api/source/daily/list?pageNum=1&pageSize=1&tradeDate=' + date,
    true,
  );
  await check(
    '/api/analysis/senti/list?startDate=' + date + '&endDate=' + date,
  );
})().catch((error) => {
  console.error(error.code || error.message);
  process.exitCode = 1;
});
