/* Recomputes historical signals using the production rule evaluators, entirely offline. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../..'),back=path.join(root,'apps/back'),dependency=createRequire(path.join(back,'package.json'));
process.chdir(back);
dependency('ts-node').register({files:true,transpileOnly:true,project:path.join(back,'tsconfig.json')});
dependency('tsconfig-paths').register({baseUrl:back,paths:{'@/*':['src/*']}});
dependency('reflect-metadata');
const {DailyService}=require(path.join(back,'src/modules/source/daily/daily.service'));
const {identityIndex}=require(path.join(back,'src/modules/source/stock/stock-identity.service'));
const {hasValidStrategySequence,meetsCommonStrategyConditions,isCloseInUpperHalf}=require(path.join(back,'src/modules/source/daily/strategy-validation'));
const {TREND_KEYS,TREND_DEFAULTS,evaluateTrend,requiredTrendDays,normalizeTrendSeries}=require(path.join(back,'src/modules/strategy/trend-rules'));
const {HORIZONS,summarize,extrema,outcome}=require('./statistics.cjs');
const source=path.resolve(process.argv[2]);
const destination=path.resolve(process.argv[3]||path.join(root,'apps/front/public/strategy-study/2026-09-30'));
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
const unpack=file=>JSON.parse(zlib.inflateSync(fs.readFileSync(path.join(source,file)).subarray(4)).toString('utf8'));
const labels={gapThreeUp:'向上跳空缺口后三连阳',gapTwoUp:'向上跳空缺口后二连阳',gapThreeHighTurnover:'向上跳空缺口后连续三日高换手率',threeDaysHighVol:'连续三日收阳',continuousGap:'连续两次向上缺口',shadowWrap:'向上跳空上影反包',volumeBreakout:'放量突破阶段高点',breakoutPullback:'突破后缩量回踩企稳',fiveMaUp:'五线顺上'};
const legacyMethods={gapThreeUp:'findGapThreeUp',gapTwoUp:'findGapTwoUp',gapThreeHighTurnover:'findGapThreeHighTurnover',threeDaysHighVol:'findThreeDaysHighVol',continuousGap:'findContinuousGap',shadowWrap:'findShadowWrap'};
const identityRows=manifest.identities.map(row=>({...row,data:unpack(row.file)}));
const primary=identityRows.find(row=>row.snapshotKey==='identity');
assert(primary && primary.asOf>=manifest.signalDates.at(-1));
const identity=identityIndex({...primary,data:{stocks:primary.data.stocks,names:[...primary.data.names,...identityRows.filter(row=>row!==primary).flatMap(row=>row.data.names||[])]}},manifest.mapping);
const dailyReady=new Set(manifest.records.filter(row=>manifest.runs.some(run=>run.date===row.date && run.task==='daily' && run.status==='success' && Number(run.dailyCount)===row.count) && !manifest.policies.some(p=>p.date===row.date)).map(row=>row.date));
const factorReady=new Set(manifest.records.filter(row=>row.factor && manifest.runs.some(run=>run.date===row.date && run.task==='strategy-factor' && run.status==='success') && !manifest.policies.some(p=>p.date===row.date)).map(row=>row.date));
const benchmark=new Map(manifest.benchmark.map(row=>[row.date,Number(row.close)]));
const rawByDay=new Map(),pointsByDay=new Map(),samples=Object.fromEntries(Object.keys(labels).map(key=>[key,[]])),screeningMissing=[],coverage=Object.fromEntries(Object.keys(labels).map(key=>[key,[]]));
const daily=new DailyService(null,null);
const fields=['tsCode','sourceName','open','close','high','low','preClose','vol','amount','upLimit','turnoverRateF'];
function loadDay(date) {
  const raw=new Map();
  for (const values of unpack(`${date}-daily.deflate`)) {
    const row=Object.fromEntries(fields.map((field,i)=>[field,values[i]]));
    const code=identity.canonical(row.tsCode),previous=raw.get(code);
    if(previous) assert(['open','close','high','low','preClose','vol'].every(key=>Number(previous[key])===Number(row[key])),`Alias conflict ${date} ${code}`);
    if(!previous || row.tsCode===code) raw.set(code,{...row,tsCode:code,tradeDate:date,name:identity.name(code,date)});
  }
  const points=new Map();
  if(factorReady.has(date)) for(const [original,open,close,high,low,basis,conversion] of unpack(`${date}-factor.deflate`)) {
    const code=identity.canonical(original),row=raw.get(code);
    const previous=points.get(code);
    if(previous && original!==code) continue;
    points.set(code,{date,code,open,close,high,low,basis:basis||original,conversion,vol:row ? Number(row.vol) : undefined,turnoverRateF:row?.turnoverRateF==null ? null : Number(row.turnoverRateF),eligible:!!row && hasValidStrategySequence([row]) && meetsCommonStrategyConditions([row]),traded:!!row && Number(row.vol)>0 && Number(row.amount)>0});
  }
  rawByDay.set(date,raw); pointsByDay.set(date,points);
}
function gap(date,code,strategy,reason) { screeningMissing.push({date,code,strategy,reason}); }
async function main() {
  fs.mkdirSync(destination,{recursive:true});
  const signalSet=new Set(manifest.signalDates);
  for(let index=0;index<manifest.calendar.length;index++) {
    const date=manifest.calendar[index]; loadDay(date);
    if(!signalSet.has(date)) continue;
    const recent=manifest.calendar.slice(index-3,index+1);
    const sequence=new Map();
    for(const row of rawByDay.get(date).values()) {
      if(!(Number(row.amount)>50000 && Number(row.vol)>0 && isCloseInUpperHalf(row))) continue;
      const series=Object.fromEntries(recent.map(day=>[day,rawByDay.get(day)?.get(row.tsCode)]));
      sequence.set(row.tsCode,series);
      if(recent.some(day=>series[day] && !series[day].name && ['open','close','high','low','preClose','vol','amount'].every(field=>Number(series[day][field])>0))) gap(date,row.tsCode,'legacy','历史名称缺失，无法确认当时ST／新股状态');
    }
    for(const [key,method] of Object.entries(legacyMethods)) {
      const required=['gapThreeUp','gapThreeHighTurnover'].includes(key)?4:3;
      if(!recent.slice(-required).every(day=>dailyReady.has(day))) { coverage[key].push({date,ready:false,reason:'行情批次缺失'}); continue; }
      let selected;
      try { selected=await daily[method](recent.slice(-required).reverse(),sequence,5); }
      catch(error) { if(key!=='gapThreeHighTurnover') throw error; const safe=new Map([...sequence].filter(([code,series])=>{const missing=recent.slice(-3).some(day=>series[day] && series[day].turnoverRateF==null); if(missing) gap(date,code,key,'形态日换手率缺失'); return !missing;})); selected=await daily[method](recent.slice(-required).reverse(),safe,5); }
      coverage[key].push({date,ready:true});
      for(const row of selected) samples[key].push({date,code:row.tsCode,name:row.name,outcomes:{}});
    }
    for(const key of TREND_KEYS) {
      const need=requiredTrendDays(key,TREND_DEFAULTS),window=manifest.calendar.slice(index-need+1,index+1),rawNeed=key==='breakoutPullback'?16:6;
      const ready=window.length===need && window.every(day=>factorReady.has(day)) && window.slice(-rawNeed).every(day=>dailyReady.has(day));
      coverage[key].push({date,ready,reason:ready?undefined:'策略所需行情／复权批次缺失'});
      if(!ready) continue;
      for(const row of rawByDay.get(date).values()) {
        if(!(Number(row.amount)>50000 && Number(row.vol)>0 && isCloseInUpperHalf(row))) continue;
        if(!row.name) { gap(date,row.tsCode,key,'历史名称缺失'); continue; }
        if(!hasValidStrategySequence([row]) || !meetsCommonStrategyConditions([row]) || !identity.listed(row.tsCode,window[0])) continue;
        if(key==='volumeBreakout' && row.turnoverRateF==null) { gap(date,row.tsCode,key,'信号日换手率缺失'); continue; }
        const series=window.map(day=>pointsByDay.get(day)?.get(row.tsCode));
        const unusable=series.some((point,i)=>{const raw=rawByDay.get(window[i])?.get(row.tsCode); return point ? ![point.open,point.close,point.high,point.low].every(v=>Number.isFinite(v)&&v>0) : !raw || Number(raw.vol)===0;});
        if(unusable) continue;
        if(series.some(point=>!point)) { gap(date,row.tsCode,key,'已上市候选复权行情缺失'); continue; }
        const normalized=normalizeTrendSeries(series,row.tsCode,need);
        if(normalized && evaluateTrend(key,normalized,TREND_DEFAULTS)) samples[key].push({date,code:row.tsCode,name:row.name,outcomes:{}});
      }
    }
    if(index%25===0 || index===manifest.calendar.length-1) console.log(JSON.stringify({computed:index-121,signalDays:250,date,signals:Object.values(samples).reduce((sum,rows)=>sum+rows.length,0)}));
  }
  for(const rows of Object.values(samples)) for(const sample of rows) {
    const index=manifest.calendar.indexOf(sample.date),start=pointsByDay.get(sample.date)?.get(sample.code);
    for(const horizon of HORIZONS) {
      const date=manifest.calendar[index+horizon]; let end=date && pointsByDay.get(date)?.get(sample.code);
      const raw=date && rawByDay.get(date)?.get(sample.code);
      if(date && dailyReady.has(date) && (raw && (Number(raw.vol)===0 || Number(raw.amount)===0) || !identity.listed(sample.code,date))) end={inactive:true,reason:identity.listed(sample.code,date)?'观察日停牌／无成交':'观察日已退市／退出上市'};
      sample.outcomes[horizon]=outcome(date,start,end,benchmark.get(sample.date),benchmark.get(date),!!date && dailyReady.has(date) && factorReady.has(date));
    }
  }
  const strategies=Object.entries(samples).map(([key,rows])=>({key,label:labels[key],signals:rows.length,stocks:new Set(rows.map(row=>row.code)).size,coverage:coverage[key],screeningMissing:screeningMissing.filter(row=>row.strategy===key || row.strategy==='legacy' && key in legacyMethods),summary:HORIZONS.map(h=>summarize(rows,h)),monthly:[...new Set(manifest.signalDates.map(date=>date.slice(0,7)))].map(month=>({month,signals:rows.filter(row=>row.date.startsWith(month)).length,summary:HORIZONS.map(h=>summarize(rows.filter(row=>row.date.startsWith(month)),h))})),extrema:HORIZONS.map(h=>({horizon:h,...extrema(rows,h)}))}));
  for(const strategy of strategies) for(const summary of strategy.summary) { assert.equal(summary.total,summary.sample+summary.pending+summary.inactive+summary.missing); assert(summary.paired<=summary.sample); }
  const contentHash=crypto.createHash('sha256');
  contentHash.update(JSON.stringify(manifest));
  for(const row of manifest.identities) contentHash.update(fs.readFileSync(path.join(source,row.file)));
  for(const date of manifest.calendar) for(const kind of ['daily','factor']) { const file=path.join(source,`${date}-${kind}.deflate`); if(fs.existsSync(file)) contentHash.update(fs.readFileSync(file)); }
  const report={version:'strategy-250-20261007-v1',generatedAt:new Date().toISOString(),sourceAsOf:manifest.extractedAt,start:manifest.signalDates[0],end:manifest.signalDates.at(-1),days:250,warmupDays:122,benchmark:{code:'000001.SH',name:'上证指数'},parameters:{...TREND_DEFAULTS,minTurnoverRateF:5,turnoverStrategies:[...Object.keys(legacyMethods),'volumeBreakout']},universe:new Set(Object.values(samples).flatMap(rows=>rows.map(row=>row.code))).size,signals:Object.values(samples).reduce((sum,rows)=>sum+rows.length,0),sourceHash:contentHash.digest('hex'),ruleHash:crypto.createHash('sha256').update(fs.readFileSync(path.join(back,'src/modules/strategy/trend-rules.ts'))).update(fs.readFileSync(path.join(back,'src/modules/source/daily/daily.service.ts'))).update(fs.readFileSync(path.join(back,'src/modules/source/daily/strategy-validation.ts'))).digest('hex'),quality:{dailyReady:dailyReady.size,factorReady:factorReady.size,missingDaily:manifest.calendar.filter(date=>!dailyReady.has(date)),missingFactors:manifest.calendar.filter(date=>!factorReady.has(date)),benchmarkMissing:manifest.signalDates.filter(date=>!benchmark.has(date)),screeningMissing:screeningMissing.length,identityAsOf:primary.asOf},strategies};
  const stockRankings=new Map(strategies.map(strategy=>[strategy.key,Object.fromEntries(strategy.extrema.map(period=>[period.horizon,period.rankings.map(row=>({code:row.code,name:row.name,first:row.first,last:row.last,sample:row.sample,average:row.average,median:row.median,riseRate:row.riseRate,excessAverage:row.excess.average,excessMedian:row.excess.median,outperformRate:row.outperformRate}))]))]));
  report.strategies=strategies.map(strategy=>({...strategy,coverage:{readyDays:strategy.coverage.filter(row=>row.ready).length,expectedDays:250,missingDates:strategy.coverage.filter(row=>!row.ready)},screeningMissing:{count:strategy.screeningMissing.length,reasons:Object.fromEntries([...new Set(strategy.screeningMissing.map(row=>row.reason))].map(reason=>[reason,strategy.screeningMissing.filter(row=>row.reason===reason).length]))},extrema:strategy.extrema.map(({rankings,...rest})=>rest)}));
  fs.writeFileSync(path.join(destination,'summary.json'),JSON.stringify(report));
  for(const [key,rows] of Object.entries(samples)) {
    const json=JSON.stringify({version:report.version,items:rows,rankings:stockRankings.get(key),screeningMissing:screeningMissing.filter(row=>row.strategy===key || row.strategy==='legacy' && key in legacyMethods)});
    fs.writeFileSync(path.join(destination,`${key}.json`),json);
    fs.writeFileSync(path.join(destination,`${key}.json.gz`),zlib.gzipSync(json,{level:9}));
  }
  fs.writeFileSync(path.join(destination,'validation.json'),JSON.stringify({partitionChecked:true,strategies:strategies.map(s=>({key:s.key,signals:s.signals,stocks:s.stocks,readyDays:s.coverage.filter(d=>d.ready).length,screeningMissing:s.screeningMissing.length,summary:s.summary})),quality:report.quality},null,2));
  console.log(JSON.stringify({complete:true,start:report.start,end:report.end,signals:report.signals,stocks:report.universe,quality:report.quality,strategies:strategies.map(s=>({key:s.key,signals:s.signals,readyDays:s.coverage.filter(d=>d.ready).length,screeningMissing:s.screeningMissing.length}))}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
