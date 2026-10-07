/* Independently recompute every published aggregate from the detailed signals. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const folder=path.resolve(process.argv[2]),read=name=>JSON.parse(fs.readFileSync(path.join(folder,name),'utf8'));
const report=read('summary.json');
const near=(actual,expected)=>{if(expected===null)assert.equal(actual,null);else assert(Math.abs(actual-expected)<0.000002,`${actual} != ${expected}`);};
const average=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.floor(sorted.length/2)])/2:null;};
function check(rows,stats){
 const all=rows.map(row=>row.outcomes[stats.horizon]),valid=all.filter(row=>row.state==='valid'),paired=valid.filter(row=>row.excess!==null);
 assert.equal(stats.total,all.length);assert.equal(stats.sample,valid.length);assert.equal(stats.paired,paired.length);
 for(const state of ['pending','inactive','missing'])assert.equal(stats[state],all.filter(row=>row.state===(state==='inactive'?'inactive':state)).length);
 const values=valid.map(row=>row.value),excess=paired.map(row=>row.excess);
 near(stats.average,average(values));near(stats.median,median(values));near(stats.riseRate,values.length?values.filter(v=>v>0).length/values.length*100:null);
 near(stats.excess.average,average(excess));near(stats.excess.median,median(excess));near(stats.outperformRate,excess.length?excess.filter(v=>v>0).length/excess.length*100:null);
 assert.equal(stats.total,stats.sample+stats.pending+stats.inactive+stats.missing);
 if(stats.sample){assert(stats.confidence[0]>=0 && stats.confidence[1]<=100);assert(stats.confidence[0]<=stats.riseRate && stats.confidence[1]>=stats.riseRate);}
}
let total=0;const codes=new Set();
assert.equal(report.days,250);assert.equal(report.strategies.length,9);
assert.deepEqual(report.quality.missingDaily,[]);assert.deepEqual(report.quality.missingFactors,[]);assert.deepEqual(report.quality.benchmarkMissing,[]);
for(const strategy of report.strategies){
 const details=read(`${strategy.key}.json`);assert.equal(zlib.gunzipSync(fs.readFileSync(path.join(folder,`${strategy.key}.json.gz`))).toString(),fs.readFileSync(path.join(folder,`${strategy.key}.json`),'utf8'));assert.equal(details.version,report.version);assert.equal(strategy.signals,details.items.length);assert.equal(strategy.coverage.readyDays,250);assert.equal(strategy.screeningMissing.count,0);
 const unique=new Set();for(const row of details.items){const key=`${row.code}:${row.date}`;assert(!unique.has(key),'Duplicate same-date signal');unique.add(key);assert(row.date>=report.start && row.date<=report.end);codes.add(row.code);
  for(const value of Object.values(row.outcomes)){if(value.state==='valid'){assert(Number.isFinite(value.value));if(value.excess!==null)near(value.excess,value.value-value.benchmark);}else assert.equal(value.value,null);}}
 for(const stats of strategy.summary)check(details.items,stats);
 assert.equal(strategy.monthly.reduce((sum,row)=>sum+row.signals,0),strategy.signals);
 for(const month of strategy.monthly){const rows=details.items.filter(row=>row.date.startsWith(month.month));assert.equal(rows.length,month.signals);for(const stats of month.summary)check(rows,stats);}
 for(const period of strategy.extrema){const rows=details.items.filter(row=>row.outcomes[period.horizon].state==='valid');if(rows.length){near(period.best.value,Math.max(...rows.map(row=>row.outcomes[period.horizon].value)));near(period.worst.value,Math.min(...rows.map(row=>row.outcomes[period.horizon].value)));assert(rows.some(row=>row.date===period.best.date && row.code===period.best.code));}}
 total+=details.items.length;
}
assert.equal(total,report.signals);assert.equal(codes.size,report.universe);
console.log(JSON.stringify({verified:true,strategies:9,periods:36,monthlyPeriods:report.strategies.reduce((sum,row)=>sum+row.monthly.length*4,0),signals:total,stocks:codes.size,start:report.start,end:report.end}));
