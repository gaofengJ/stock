// Incident-scoped recovery: enqueue missing-only work; never delete market data.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const db = require(process.cwd() + '/dist/migration-data-source').default;
const date = '2026-10-13';
(async () => {
  const source = fs.readFileSync(process.cwd() + '/dist/modules/daily-task/sync-source.service.js', 'utf8');
  assert.ok(source.includes('stockLimits = limits.filter'), 'Deploy the reviewed source-scope fix before recovery');
  await db.initialize();
  try {
    const [cal] = await db.query('SELECT is_open FROM t_source_trade_cal WHERE cal_date=?', [date]);
    assert.equal(Number(cal?.is_open), 1);
    assert.equal((await db.query('SELECT trade_date FROM t_sync_day_policy WHERE trade_date=?', [date])).length, 0, 'Protected date must not be reimported');
    const tables = ['t_source_daily','t_source_limit','t_source_index_daily','t_processed_market_daily','t_processed_senti','t_processed_market_breadth','t_source_ths_daily','t_source_strategy_factor','t_processed_stock_insight','t_source_ths_hot'];
    const historical = async () => {
      const out = {};
      for (const table of tables) {
        const columns = (await db.query(`SHOW COLUMNS FROM ${table}`)).map(c=>c.Field);
        assert.ok(columns.every(c=>/^[a-z_]+$/.test(c)), 'Unexpected column identifier');
        const fields = columns.map(c=>'`'+c+'`').join(',');
        out[table] = await db.query(`SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,COUNT(*) count,SUM(id) ids,SUM(CRC32(JSON_ARRAY(${fields}))) contentChecksum FROM ${table} WHERE trade_date IN ('2026-10-09','2026-10-12') GROUP BY trade_date ORDER BY trade_date`);
      }
      return out;
    };
    const before = await historical();
    console.log(JSON.stringify({phase:'before',historical:before}));
    await db.query("INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,'10月13日缺失数据修复',?,?,'queued','incident-20261013-missing','missing','仅补齐缺失数据，保留已有记录') ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)", [date,date]);
    const required = ['daily','market-index','market','market-breadth','ths-daily','strategy-factor','stock-insight','ths-hot'];
    for (let attempt=0; attempt<32; attempt++) {
      const runs = await db.query('SELECT task,status,error FROM t_sync_run WHERE trade_date=?', [date]);
      const jobs = await db.query("SELECT id,mode,status,stage,error FROM t_admin_job WHERE active_key='incident-20261013-missing' OR (start_date=? AND end_date=?) ORDER BY id DESC LIMIT 10", [date,date]);
      console.log(JSON.stringify({phase:'progress',runs,jobs}));
      const successes = new Set(runs.filter(r=>r.status==='success').map(r=>r.task));
      if (required.every(task=>successes.has(task))) {
        const after = await historical();
        assert.deepEqual(after,before,'Previous trading-day record counts or identities changed');
        const coverage = {};
        for(const table of tables) [coverage[table]]=await db.query(`SELECT COUNT(*) count FROM ${table} WHERE trade_date=?`,[date]);
        const holes = await db.query("SELECT DATE_FORMAT(c.cal_date,'%Y-%m-%d') date,r.status FROM t_source_trade_cal c LEFT JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='market' LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date WHERE c.is_open=1 AND c.cal_date BETWEEN '2024-10-13' AND ? AND (r.id IS NULL OR r.status<>'success') AND p.trade_date IS NULL ORDER BY c.cal_date",[date]);
        console.log(JSON.stringify({phase:'verified',date,historicalUnchanged:true,coverage,coreHistoryHoles:holes}));
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,15000));
    }
    throw new Error('Recovery queued but not all dependent stages completed; inspect progress without deleting or resetting data');
  } finally { await db.destroy(); }
})().catch(e=>{console.error(e.code || e.message);process.exitCode=1;});
