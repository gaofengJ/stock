/* Read-only spot checks of offline selections against the actual database-backed TrendService. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const back=path.resolve(__dirname,'../../apps/back'),dependency=createRequire(path.join(back,'package.json'));
dependency('dotenv').config({path:process.env.APP_ENV_FILE || path.join(back,'.env.development')});
process.chdir(back);dependency('ts-node').register({files:true,transpileOnly:true,project:path.join(back,'tsconfig.json')});dependency('tsconfig-paths').register({baseUrl:back,paths:{'@/*':['src/*']}});dependency('reflect-metadata');
const {DataSource}=dependency('typeorm'),{TrendService}=require(path.join(back,'src/modules/strategy/trend.service'));
const {StockIdentityService,identityIndex}=require(path.join(back,'src/modules/source/stock/stock-identity.service'));
const privateFolder=path.resolve(process.argv[2]),published=path.resolve(process.argv[3]),manifest=JSON.parse(fs.readFileSync(path.join(privateFolder,'manifest.json')));
const snapshots=manifest.identities.map(row=>({...row,data:JSON.parse(zlib.inflateSync(fs.readFileSync(path.join(privateFolder,row.file)).subarray(4)).toString())})),primary=snapshots.find(row=>row.snapshotKey==='identity');
const identity=identityIndex({...primary,data:{stocks:primary.data.stocks,names:snapshots.flatMap(row=>row.data.names||[])}},manifest.mapping);
const entities=[
 ['src/modules/source/daily/daily.entity','DailyEntity'],['src/modules/source/trade-cal/trade-cal.entity','TradeCalEntity'],
 ['src/modules/source/stock/stock-history.entity','StockHistoryEntity'],['src/modules/daily-task/sync-run.entity','SyncRunEntity'],
 ['src/modules/daily-task/sync-day-policy.entity','SyncDayPolicyEntity'],['src/modules/strategy/trend.entity','TrendFactorEntity'],
 ['src/modules/analysis/market/market.entity','BseMappingEntity'],
].map(([file,name])=>require(path.join(back,file))[name]);
const db=new DataSource({type:'mysql',host:process.env.DB_HOST,port:Number(process.env.DB_PORT||3306),username:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,timezone:'Z',entities,synchronize:false,logging:false,extra:{connectionLimit:1}});
async function main(){
 await db.initialize();const runner=db.createQueryRunner();await runner.connect();const query=runner.query.bind(runner);await query('START TRANSACTION READ ONLY');db.manager=runner.manager;db.query=query;
 const checker=new StockIdentityService(db,null),service=new TrendService(db,null,{load:async()=>identity,assertReady:dates=>checker.assertReady(dates)},null);
 try{for(const date of ['2025-09-18','2026-03-02','2026-09-30']){
  const result=await service.history([date],['volumeBreakout','breakoutPullback','fiveMaUp'],{},undefined,true);
  for(const key of ['volumeBreakout','breakoutPullback','fiveMaUp']){const actual=result.items.find(row=>row.date===date && row.key===key)?.rows.map(row=>identity.canonical(row.tsCode)).sort();const expected=JSON.parse(fs.readFileSync(path.join(published,`${key}.json`))).items.filter(row=>row.date===date).map(row=>row.code).sort();assert.deepEqual(actual,expected,`${key} ${date}`);console.log(JSON.stringify({verified:true,date,key,hits:expected.length}));}
 }}finally{await query('ROLLBACK');await runner.release();await db.destroy();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
