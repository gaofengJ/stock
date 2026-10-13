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
    const { TushareService } = require(process.cwd() + '/dist/shared/tushare/tushare.service');
    const { HttpService } = require('@nestjs/axios');
    const source = new TushareService(new HttpService());
    const names = ['daily','stk_limit','daily_basic','suspend_d'];
    const data = await Promise.all(names.map(api => source.queryData(api, {trade_date:'20261013'}, api==='suspend_d'?'ts_code,trade_date,suspend_type,suspend_timing':undefined)));
    const records = data.map(res=>res.data.items.map(row=>Object.fromEntries(res.data.fields.map((key,i)=>[key,row[i]]))));
    report.sourceCounts = Object.fromEntries(names.map((name,i)=>[name,records[i].length]));
    const quotes = new Set(records[0].map(row=>row.ts_code));
    const missing = records[1].filter(row=>!quotes.has(row.ts_code));
    const stocks = await r.query('SELECT ts_code,name,list_date FROM t_source_stock');
    const known = new Map(stocks.map(row=>[row.ts_code,row]));
    report.missingQuotes = missing.map(row=>({code:row.ts_code,stock:known.get(row.ts_code),basic:records[2].some(b=>b.ts_code===row.ts_code),suspensions:records[3].filter(s=>s.ts_code===row.ts_code)}));
    report.sourceSuspensions = records[3];
    report.factorGap = {};
    for (const api of ['stk_factor_pro','adj_factor']) {
      const res = await source.queryData(api,{trade_date:'20261013',ts_code:'301660.SZ'},api==='stk_factor_pro'?'ts_code,trade_date,open_hfq,close_hfq,high_hfq,low_hfq':undefined);
      report.factorGap[api] = res.data;
    }
    report.factorGap.stock = await r.query("SELECT ts_code,name,list_date FROM t_source_stock WHERE ts_code='301660.SZ'");
    report.factorGap.quote = await r.query("SELECT ts_code,trade_date,open,high,low,close,vol FROM t_source_daily WHERE ts_code='301660.SZ' AND trade_date='2026-10-13'");
    console.log(JSON.stringify(report));
  } finally { await r.release(); await db.destroy(); }
})().catch(e=>{console.error(e.code || e.message);process.exitCode=1;});
