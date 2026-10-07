/* Read-only, repeatable research extraction. Never boots application jobs or writes source tables. */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const back = path.resolve(__dirname, '../../apps/back');
const dependency = createRequire(path.join(back, 'package.json'));
dependency('dotenv').config({ path: process.env.APP_ENV_FILE || path.join(back, '.env.development') });
const { DataSource } = dependency('typeorm');
const db = new DataSource({ type: 'mysql', host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, timezone: 'Z', synchronize: false, logging: false, extra: { connectionLimit: 1 } });
const destination = path.resolve(process.argv[2] || './strategy-study-private');
async function main() {
  fs.mkdirSync(destination, { recursive: true });
  await db.initialize();
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await runner.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const [latest] = await runner.query("SELECT DATE_FORMAT(MAX(trade_date),'%Y-%m-%d') date FROM t_sync_run WHERE task='daily' AND status='success' AND trade_date<=CURDATE()");
    const calendar = (await runner.query("SELECT DATE_FORMAT(cal_date,'%Y-%m-%d') date FROM t_source_trade_cal WHERE is_open=1 AND cal_date<=? ORDER BY cal_date DESC LIMIT 372", [latest.date])).map(r => r.date).reverse();
    if (calendar.length !== 372) throw new Error('250 signal days plus MA122 warmup are required');
    const from = calendar[0], to = calendar.at(-1);
    const runs = await runner.query("SELECT task,DATE_FORMAT(trade_date,'%Y-%m-%d') date,status,daily_count dailyCount,CAST(updated_at AS CHAR) revision FROM t_sync_run WHERE trade_date BETWEEN ? AND ? AND task IN ('daily','strategy-factor')", [from, to]);
    const policies = await runner.query("SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,reason FROM t_sync_day_policy WHERE trade_date BETWEEN ? AND ?", [from, to]);
    const identity = await runner.query("SELECT snapshot_key snapshotKey,DATE_FORMAT(as_of,'%Y-%m-%d') asOf,COMPRESS(data) packed FROM t_source_stock_history WHERE snapshot_key='identity' OR snapshot_key BETWEEN ? AND ?", [`day:${from}`, `day:${to}`]);
    const mapping = await runner.query('SELECT old_code oldCode,new_code newCode FROM t_source_bse_mapping');
    const benchmark = await runner.query("SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,JSON_EXTRACT(data,'$.close') close FROM t_source_index_daily WHERE ts_code='000001.SH' AND trade_date BETWEEN ? AND ? ORDER BY trade_date", [from, to]);
    const identities = identity.map((row,i) => { fs.writeFileSync(path.join(destination,`identity-${i}.deflate`),row.packed); return {snapshotKey:row.snapshotKey,asOf:row.asOf,file:`identity-${i}.deflate`}; });
    const records = [];
    for (let i = 0; i < calendar.length; i++) {
      const date = calendar[i];
      const [row] = await runner.query("SELECT COUNT(*) count,COMPRESS(JSON_ARRAYAGG(JSON_ARRAY(ts_code,name,open,close,high,low,pre_close,vol,amount,up_limit,turnover_rate_f))) daily,(SELECT COMPRESS(data) FROM t_source_strategy_factor WHERE trade_date=?) factor FROM t_source_daily WHERE trade_date=?", [date,date]);
      if (row.daily) fs.writeFileSync(path.join(destination,`${date}-daily.deflate`),row.daily);
      if (row.factor) fs.writeFileSync(path.join(destination,`${date}-factor.deflate`),row.factor);
      records.push({date,count:Number(row.count),factor:!!row.factor});
      if (i % 25 === 0 || i === calendar.length - 1) console.log(JSON.stringify({extracted:i+1,total:calendar.length,date}));
    }
    const manifest={extractedAt:new Date().toISOString(),calendar,signalDates:calendar.slice(-250),runs,policies,identities,mapping,benchmark,records};
    fs.writeFileSync(path.join(destination,'manifest.json'),JSON.stringify(manifest));
    console.log(JSON.stringify({complete:true,start:manifest.signalDates[0],end:to,days:250,benchmarkDays:benchmark.length,identityFiles:identities.length}));
  } finally {
    await runner.query('ROLLBACK');
    await runner.release();
    await db.destroy();
  }
}
main().catch(error => { console.error(error.code || error.message); process.exitCode=1; });
