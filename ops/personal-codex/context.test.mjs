import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {candidateSnapshot,reviewSnapshot,compactChart,strategySpec} from './context.mjs';
import {createConsole} from './server.mjs';
import {validateTask,sha} from './core.mjs';
const date='2026-10-16',code='000099.SZ';
const input=()=>({key:randomUUID(),skill:'candidate-compare',date,codes:[code],message:'分析',model:'gpt-6.1-sol',effort:'high',strategy:{type:'volumeBreakout',parameters:{breakoutDays:20,volumeDays:5,volumeMultiple:1.5,minTurnoverRateF:5}}});
const daily={tsCode:code,name:'测试股票',tradeDate:date,close:10,open:9,high:11,low:8,amount:90000,turnoverRateF:9,breakoutPrice:9.5,volumeMultiple:2,industries:[{name:'行业',asOf:date}],topics:[{name:'题材',asOf:date}],strategies:[{key:'volumeBreakout'}]};
const bars=Array.from({length:125},(_,i)=>({date:new Date(Date.UTC(2026,5,14+i)).toISOString().slice(0,10),open:9,close:10,high:11,low:8,vol:100}));
bars[124].date=date;
const fixtures=path=>{
 const url=new URL(path,'https://test');
 if(url.pathname==='/strategy/list'){assert.equal(url.searchParams.get('volumeMultiple'),'1.5');return [daily];}
 if(url.pathname==='/strategy/chart')return {basis:'后复权',series:[...bars,{date:'2026-10-19',close:10000}],evidence:{breakoutPrice:9.5,volumeMultiple:2}};
 if(url.pathname==='/strategy/candidate-context')return [{tsCode:code,sectorContextReady:true,sectorPerformance:Array.from({length:22},(_,i)=>({code:String(i),name:'标签'+i,type:i?'N':'I',asOf:date,day:i/7,five:2,twenty:3,maxHeight:1}))}];
 if(url.pathname==='/strategy/candidate-financials')return {items:[{tsCode:code,sourceState:'ready',history:[{announcedAt:'2026-10-01',reportDate:'2026-06-30',status:'profit',amount:100},{announcedAt:'2026-10-20',amount:999}],forecast:{announcedAt:'2026-10-20',profitMin:999}}]};
 if(url.pathname==='/analysis/market/candidate-environment')return {date,market:{amount:10000,upRatio:60,up:3000,total:5000},breadth:{ma20:{ratio:60},ma60:{ratio:50}}};
 if(url.pathname==='/analysis/market/overview'){assert.equal(url.searchParams.get('days'),'60');return {indexes:[{code:'000001.SH',name:'上证指数',series:bars}]};}
 if(url.pathname==='/review/report')return {date,complete:true,counts:{unique:20},strategies:[{key:'volumeBreakout',label:'放量突破',state:'ready',count:20}],items:Array.from({length:20},(_,i)=>({...daily,tsCode:String(i)}))};
 throw Error('unexpected read '+url.pathname);
};
test('strategy validation binds only effective typed parameters; rejects injection and unknown routes',()=>{
 assert.equal(strategySpec({type:'fiveMaUp',parameters:{breakoutDays:30}}).parameters.breakoutDays,undefined);
 for(const patch of [{type:'../../x'},{type:'volumeBreakout',parameters:{url:'https://evil'}},{type:'volumeBreakout',parameters:{breakoutDays:'20'}},{type:'volumeBreakout',sector:'x&code=1'}])assert.throws(()=>strategySpec(patch));
 assert.throws(()=>validateTask({...input(),strategy:undefined}));
});
test('candidate snapshot verifies membership, preserves market/stock/evidence, removes future data and redundant topics',async()=>{
 const data=await candidateSnapshot(input(),async path=>fixtures(path));
 assert.equal(data.stocks[0].selection.matched,true);assert.equal(data.stocks[0].quote.close,10);
 assert.equal(data.stocks[0].trend.ma[120],10);assert.equal(data.stocks[0].trend.returnsPct.five,0);
 assert.equal(data.stocks[0].sectors.items.length,5);assert.equal(data.stocks[0].sectors.omittedTopics,17);
 assert.equal(data.stocks[0].financial.history.length,1);assert.equal(data.stocks[0].financial.forecast,null);
 assert.equal(data.market.stats.upRatio,60);assert.equal(data.indexes.length,1);
 assert(!JSON.stringify(data).includes('2026-10-19'));assert(!JSON.stringify(data).includes('2026-10-20'));
 assert(Buffer.byteLength(JSON.stringify(data))<10000);
 await assert.rejects(()=>candidateSnapshot({...input(),codes:['999999.SZ']},async path=>fixtures(path)),/当前策略候选/);
});
test('missing sessions and optional source failures remain explicit; authorization failures never degrade silently',async()=>{
 const c=compactChart({series:[{date:'2026-10-15',close:null},{date,close:10}]},date);assert.equal(c.ma[5],null);assert.equal(c.missingSessions,1);
 const s=await candidateSnapshot(input(),async path=>{if(path.includes('candidate-financials'))throw Error('offline');return fixtures(path);});assert(s.gaps.some(x=>x.includes('业绩')));
 await assert.rejects(()=>candidateSnapshot(input(),async path=>{if(path.includes('candidate-context'))throw Object.assign(Error('denied'),{status:403});return fixtures(path);}),/denied/);
});
test('core market failures stop both business contexts instead of producing a misleading incomplete snapshot',async()=>{
 for(const endpoint of ['candidate-environment','overview']) {
  const read=async path=>{if(path.includes('/analysis/market/'+endpoint))throw Object.assign(Error('HTTP 404'),{status:503});return fixtures(path);};
  await assert.rejects(()=>candidateSnapshot(input(),read),/HTTP 404/);
  await assert.rejects(()=>reviewSnapshot({date},read),/HTTP 404/);
 }
});
test('review uses all candidates for structure, discloses sample bias and keeps actual per-stock strategies',async()=>{
 const s=await reviewSnapshot({date},async path=>fixtures(path));assert.equal(s.total,20);assert.equal(s.included,12);assert.equal(s.omitted,8);assert.equal(s.candidateStructure.industries[0].count,20);assert.deepEqual(s.items[0].strategies,['volumeBreakout']);assert(s.market);assert(s.indexes.length);
 await assert.rejects(()=>reviewSnapshot({date},async path=>path.includes('/review/')?{date:'2026-10-15',items:[]}:fixtures(path)),/日期/);
});
test('preview endpoints authenticate, consume no model calls or task budget; submit/followup preserve strategy, skill and timings',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'context-flow-')), token='b'.repeat(64),origin='https://example.test';let runs=0,metadataReads=0,lastPrompt='';
 const runner={metadata:async()=>{metadataReads++;return {models:[{model:'gpt-6.1-sol',efforts:['high']}],quota:{ordinaryUsageAllowed:true,primary:{usedPercent:2}}};},run:async(t,p)=>{runs++;lastPrompt=p;return{success:true,completedTurns:1,answer:'## 结果\n完成',usage:{input_tokens:100,output_tokens:20},metrics:{firstEventMs:1,firstAnswerMs:2,processMs:3}};},stop(){}};
 const {server,store}=createConsole({ownerId:1,origin,backend:'http://backend/api',enabled:true,dataDir:dir},{runner,fetch:async url=>new Response(JSON.stringify({data:url.endsWith('/auth/me')?{id:1,roles:[{code:'admin'}]}:fixtures(new URL(url).pathname.replace(/^\/api/,'')+new URL(url).search)}))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const req=(path,body,auth=true)=>fetch(`http://127.0.0.1:${server.address().port}/personal-ai/api${path}`,{method:'POST',headers:{'content-type':'application/json',origin,'x-csrf-token':sha('csrf:'+token),...(auth?{cookie:'stock_session='+token}:{})},body:JSON.stringify(body)});
 try{
  assert.equal((await req('/preview',input(),false)).status,401);
  for(const skill of ['candidate-compare','market-review']){const response=await req('/preview',{...input(),skill,codes:skill==='market-review'?[]:[code],...(skill==='market-review'?{strategy:undefined}:{})});assert.equal(response.status,200);const data=await response.json();assert.equal(data.modelCalled,false);assert(data.inputBytes>0);}
  assert.equal(runs,0);assert.equal(metadataReads,0);assert.equal(store.tasks.length,0);assert.deepEqual(store.usedToday(),{calls:0,tokens:0});
  const original=input(),result=await req('/tasks',original);assert.equal(result.status,202);
  for(let i=0;i<100&&store.tasks[0].status!=='completed';i++)await new Promise(r=>setTimeout(r,5));
  const task=store.tasks[0];assert.equal(task.status,'completed');assert.equal(task.skillVersion,'v2');assert(task.timings.total>=0);assert.equal(task.executionMetrics.firstAnswerMs,2);assert(lastPrompt.includes('candidate-compare / v2'));assert(!lastPrompt.includes('fetchMs'));assert(!lastPrompt.includes(token));
  assert.equal((await req('/tasks',original)).status,200);assert.equal(runs,1);
  const bad={...input(),parentId:task.id,strategy:{type:'gapTwoUp',parameters:{}}};assert.equal((await req('/tasks',bad)).status,400);
  const follow={...input(),parentId:task.id,message:'追问'};assert.equal((await req('/tasks',follow)).status,202);
  for(let i=0;i<100&&store.tasks[1].status!=='completed';i++)await new Promise(r=>setTimeout(r,5));
  assert.deepEqual(store.tasks[1].snapshot,task.snapshot);assert.equal(runs,2);
 }finally{await new Promise(r=>{server.close(r);server.closeAllConnections();});rmSync(dir,{recursive:true,force:true});}
});
