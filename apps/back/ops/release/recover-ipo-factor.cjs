const assert = require('node:assert/strict');
const root = process.cwd() + '/dist/';
const db = require(root + 'migration-data-source').default;
const { DailyEntity } = require(root+'modules/source/daily/daily.entity');
const { StockEntity } = require(root+'modules/source/stock/stock.entity');
const { SyncRunEntity } = require(root+'modules/daily-task/sync-run.entity');
const { SyncDayPolicyEntity } = require(root+'modules/daily-task/sync-day-policy.entity');
const { TrendFactorEntity } = require(root+'modules/strategy/trend.entity');
const { BseMappingEntity } = require(root+'modules/analysis/market/market.entity');
const { TrendService } = require(root+'modules/strategy/trend.service');
const { SyncWriteService } = require(root+'modules/daily-task/sync-write.service');
const { TushareService } = require(root+'shared/tushare/tushare.service');
const { HttpService } = require('@nestjs/axios');
const date='2026-10-13', code='301660.SZ';
db.setOptions({entities:[DailyEntity,StockEntity,SyncRunEntity,SyncDayPolicyEntity,TrendFactorEntity,BseMappingEntity]});
(async()=>{
 await db.initialize();
 try {
  const source=new TushareService(new HttpService());
  const records=res=>{assert.equal(res.code,0);return res.data.items.map(row=>Object.fromEntries(res.data.fields.map((key,i)=>[key,row[i]])));};
  const [stock]=await db.query("SELECT DATE_FORMAT(list_date,'%Y-%m-%d') date FROM t_source_stock WHERE ts_code=?",[code]);
  assert.equal(stock.date,date);
  const [quote]=await db.query('SELECT open,close,high,low FROM t_source_daily WHERE ts_code=? AND trade_date=?',[code,date]);
  const factors=records(await source.queryData('adj_factor',{ts_code:code,trade_date:'20261013'},'ts_code,trade_date,adj_factor'));
  assert.equal(factors.length,1);assert.equal(factors[0].ts_code,code);assert.equal(factors[0].trade_date,'20261013');assert.equal(Number(factors[0].adj_factor),1);
  const prices=['open','close','high','low'].map(field=>Number(quote[field]));
  assert.ok(prices.every(p=>Number.isFinite(p)&&p>0));
  assert.ok(prices[2]>=Math.max(prices[0],prices[1])&&prices[3]<=Math.min(prices[0],prices[1]));
  const wrapped={queryData:async(...args)=>{
   const res=await source.queryData(...args);
   if(args[0]!=='stk_factor_pro')return res;
   assert.equal(args[1].trade_date,'20261013');
   const rows=records(res);
   assert.ok(rows.length>5000);
   if(!rows.some(row=>row.ts_code===code)){
    const row={ts_code:code,trade_date:'20261013',open_hfq:prices[0],close_hfq:prices[1],high_hfq:prices[2],low_hfq:prices[3]};
    assert.ok(res.data.fields.every(field=>Object.hasOwn(row,field)));
    res.data.items.push(res.data.fields.map(field=>row[field]));
   }
   return res;
  }};
  const writes=new SyncWriteService(db);
  await writes.withLock(manager=>new TrendService(db,wrapped,null,writes).syncDay(manager,date,true));
  await db.query("INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,'上市首日因子核验后补齐',?,?,'queued','incident-20261013-insights','insights','已核验首日单位复权因子，重算当日策略统计') ON DUPLICATE KEY UPDATE id=id",[date,date]);
  const [factor]=await db.query('SELECT JSON_LENGTH(data) count FROM t_source_strategy_factor WHERE trade_date=?',[date]);
  console.log(JSON.stringify({phase:'ipo-factor-recovered',date,code,confirmedFactor:1,snapshotCount:factor.count}));
 }finally{await db.destroy();}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
