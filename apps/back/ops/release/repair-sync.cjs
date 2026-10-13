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
        const { TushareService } = require(process.cwd()+'/dist/shared/tushare/tushare.service');
        const { HttpService } = require('@nestjs/axios');
        const source = new TushareService(new HttpService());
        const quoteData = await source.getDaily(date.replace(/-/g,''));
        assert.equal(quoteData.code,0);
        const quotes = quoteData.data.items.map(row=>Object.fromEntries(quoteData.data.fields.map((field,i)=>[field,row[i]])));
        const stored = await db.query('SELECT ts_code,open,high,low,close,pre_close,`change`,pct_chg,vol,amount FROM t_source_daily WHERE trade_date=?',[date]);
        const byCode = new Map(stored.map(row=>[row.ts_code,row]));
        const fields = ['open','high','low','close','pre_close','change','pct_chg','vol','amount'];
        for (const quote of quotes) {
          assert.equal(quote.trade_date,'20261013');
          assert.ok(byCode.has(quote.ts_code),'Missing source quote '+quote.ts_code);
          for (const field of fields) assert.equal(Number(byCode.get(quote.ts_code)[field]),Math.sign(Number(quote[field])) * Math.round((Math.abs(Number(quote[field])) + 1e-9) * 100) / 100,'Quote mismatch '+quote.ts_code+' '+field);
        }
        const extra = stored.filter(row=>!quotes.some(q=>q.ts_code===row.ts_code));
        const suspensionData = await source.queryData('suspend_d',{trade_date:'20261013'},'ts_code,trade_date,suspend_type,suspend_timing');
        const suspensions = suspensionData.data.items.map(row=>Object.fromEntries(suspensionData.data.fields.map((field,i)=>[field,row[i]])));
        for(const row of extra) {
          const events = suspensions.filter(s=>s.ts_code===row.ts_code);
          assert.ok(events.some(s=>s.suspend_type==='S'&&!s.suspend_timing)&&events.every(s=>s.suspend_type==='S'&&!s.suspend_timing),'Unverified non-quote record '+row.ts_code);
        }
        const holes = await db.query("SELECT DATE_FORMAT(c.cal_date,'%Y-%m-%d') date,r.status FROM t_source_trade_cal c LEFT JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='market' LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date WHERE c.is_open=1 AND c.cal_date BETWEEN '2024-10-13' AND ? AND (r.id IS NULL OR r.status<>'success') AND p.trade_date IS NULL ORDER BY c.cal_date",[date]);
        console.log(JSON.stringify({phase:'verified',date,historicalUnchanged:true,sourceQuotesMatched:quotes.length,decimalScale:2,verifiedSuspensions:extra.length,coverage,coreHistoryHoles:holes}));
        return;
      }
      await new Promise(resolve=>setTimeout(resolve,15000));
    }
    throw new Error('Recovery queued but not all dependent stages completed; inspect progress without deleting or resetting data');
  } finally { await db.destroy(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;});
