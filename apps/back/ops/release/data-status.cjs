// Operational read-only status; never print connection options or raw account data.
const db = require('../../dist/migration-data-source').default;
(async () => {
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('SET SESSION TRANSACTION READ ONLY');
    const report = { database: db.options.database };
    report.jobs = await runner.query(
      'SELECT id,status,stage,error,updated_at FROM t_admin_job ORDER BY id DESC LIMIT 3',
    );
    report.stages = await runner.query(
      "SELECT task,status,COUNT(*) days,MAX(trade_date) latest FROM t_sync_run WHERE task IN ('daily','market-index','market') GROUP BY task,status",
    );
    report.tables = {};
    for (const table of [
      't_source_daily',
      't_source_limit',
      't_source_index_daily',
      't_processed_market_daily',
    ]) {
      [report.tables[table]] = await runner.query(
        `SELECT COUNT(*) rowsCount,COUNT(DISTINCT trade_date) days,MIN(trade_date) firstDate,MAX(trade_date) lastDate FROM ${table}`,
      );
    }
    console.log(JSON.stringify(report));
  } finally {
    await runner.release();
    await db.destroy();
  }
})().catch((e) => {
  console.error(e.code || e.message);
  process.exitCode = 1;
});
