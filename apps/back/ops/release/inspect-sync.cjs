// Read-only incident diagnostics. No user content or credentials are emitted.
const db = require(process.cwd() + '/dist/migration-data-source').default;
(async () => {
  await db.initialize();
  const r = db.createQueryRunner();
  await r.connect();
  try {
    await r.query('SET SESSION TRANSACTION READ ONLY');
    const report = { now: new Date().toISOString(), flags: {} };
    for (const key of ['NODE_ENV','SCHEDULE_ENABLED','SYNC_SCHEDULE_ENABLED','SYNC_ON_STARTUP','SYNC_START_DATE']) report.flags[key] = process.env[key];
    report.calendar = await r.query("SELECT cal_date,is_open,pre_trade_date FROM t_source_trade_cal WHERE cal_date BETWEEN '2026-10-09' AND '2026-10-14'");
    report.protections = await r.query("SELECT * FROM t_sync_day_policy WHERE trade_date BETWEEN '2026-10-09' AND '2026-10-14'");
    report.runs = await r.query("SELECT task,trade_date,status,attempts,daily_count,limit_count,senti_count,error,updated_at FROM t_sync_run WHERE trade_date >= '2026-10-12' ORDER BY trade_date,task");
    report.jobs = await r.query('SELECT id,status,stage,error,updated_at FROM t_admin_job ORDER BY id DESC LIMIT 12');
    report.coverage = {};
    const tables = await r.query("SELECT TABLE_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND COLUMN_NAME='trade_date' AND TABLE_NAME NOT LIKE 't_review%'");
    for (const {name} of tables) {
      if (!/^t_[a-z_]+$/.test(name)) continue;
      report.coverage[name] = await r.query(`SELECT trade_date,COUNT(*) count FROM ${name} WHERE trade_date BETWEEN '2026-10-09' AND '2026-10-14' GROUP BY trade_date`);
    }
    report.processes = await r.query("SELECT ID,TIME,STATE,LEFT(INFO,240) statement FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND COMMAND<>'Sleep' AND ID<>CONNECTION_ID()");
    console.log(JSON.stringify(report));
  } finally { await r.release(); await db.destroy(); }
})().catch(e=>{console.error(e.code || e.message);process.exitCode=1;});
