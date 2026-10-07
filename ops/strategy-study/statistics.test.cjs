const test=require('node:test'),assert=require('node:assert/strict');
const {distribution,wilson,summarize,outcome,extrema}=require('./statistics.cjs');
test('statistics distinguish zero, losses and absent data; medians support odd/even samples',()=>{
  assert.deepEqual(distribution([-4,0,2,null,NaN]),{sample:3,average:-.666667,median:0});
  assert.equal(distribution([-4,0,2,6]).median,1);
  assert.equal(distribution([]).average,null);
});
test('Wilson 95% intervals have known endpoints and remain bounded with zero/all wins',()=>{
  assert.deepEqual(wilson(5,10),[23.659309,76.340691]);
  assert.equal(wilson(0,10)[0],0); assert.equal(wilson(10,10)[1],100); assert.equal(wilson(0,0),null);
});
test('signals remain independent; zero does not rise or outperform; benchmark denominators are paired',()=>{
  const samples=[{value:0,benchmark:0,excess:0,state:'valid'},{value:2,benchmark:1,excess:1,state:'valid'},{value:-1,benchmark:null,excess:null,state:'valid'},{state:'pending'},{state:'inactive'},{state:'missing'}].map((v,i)=>({code:'000001.SZ',date:`2026-09-${i+1}`,outcomes:{1:v}}));
  const result=summarize(samples,1);
  assert.equal(result.total,6); assert.equal(result.sample,3); assert.equal(result.riseRate,33.333333); assert.equal(result.paired,2); assert.equal(result.benchmarkMissing,1); assert.equal(result.outperformRate,50);
  assert.equal(result.total,result.sample+result.pending+result.inactive+result.missing);
});
test('exact market-calendar endpoints do not roll through suspension; split/code bases bridge only verified ratios',()=>{
  const start={traded:true,close:10,basis:'old'},end={traded:true,close:30,basis:'new',code:'new',conversion:2};
  assert.equal(outcome('2026-09-30',start,end,100,110).value,50);
  assert(Math.abs(outcome('2026-09-30',start,end,100,110).excess-40)<1e-10);
  assert.equal(outcome(null,start,end,100,110).state,'pending');
  assert.equal(outcome('2026-09-30',start,{inactive:true},100,110).state,'inactive');
  assert.equal(outcome('2026-09-30',start,{...end,conversion:null},100,110).state,'missing');
});
test('individual extrema and repeated stock averages preserve all dates without deduplication',()=>{
  const rows=[-10,20,1].map((value,i)=>({date:`2026-09-${i+1}`,code:i===2?'B':'A',name:i===2?'乙':'甲',outcomes:{1:{date:'2026-09-30',value,benchmark:0,excess:value,state:'valid'}}}));
  const result=extrema(rows,1); assert.equal(result.best.value,20); assert.equal(result.worst.value,-10); assert.equal(result.rankings.find(r=>r.code==='A').sample,2); assert.equal(result.rankings.find(r=>r.code==='A').average,5);
  assert.equal(result.best.date,'2026-09-2');assert.equal(result.best.observationDate,'2026-09-30');
});
