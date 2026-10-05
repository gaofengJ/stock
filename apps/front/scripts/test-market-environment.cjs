const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/app/analysis/components/market-environment.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', code)(exportsObject);
const {indexComparison, relativeChange, breadthDelta} = exportsObject;

test('comparison uses a common baseline and trading calendar, never shifts dates on a gap', () => {
  const dates = ['d1','d2','d3','d4'];
  const indexes = [{code:'a',name:'a',series:[{date:'d1',close:100},{date:'d2',close:110},{date:'d4',close:120}]}, {code:'b',name:'b',series:[{date:'d2',close:50},{date:'d3',close:55},{date:'d4',close:60}]}];
  const all = indexComparison(indexes, dates, 730);
  assert.equal(all.baseline,'d1');
  assert.deepEqual(all.indexes[0].values.map(v=>v==null?null:Math.round(v)),[0,10,null,20]);
  assert.deepEqual(all.indexes[1].values,[null,null,null,null]);
  assert.equal(all.indexes[1].change,null);
  const recent = indexComparison(indexes, dates, 2);
  assert.equal(recent.baseline,'d2');
  assert.deepEqual(recent.dates,['d3','d4']);
  assert.equal(Math.round(recent.indexes[1].change),20);
});

test('comparison shows exactly the same 60 dates as amount and breadth, retaining prior-close baseline', () => {
  const dates = Array.from({length: 90}, (_, i) => `d${i}`);
  const result = indexComparison([{code:'a',name:'a',series:dates.map((date,i)=>({date,close:100+i}))}], dates, 60);
  assert.deepEqual(result.dates, dates.slice(-60));
  assert.equal(result.baseline, 'd29');
  assert.equal(result.indexes[0].change, result.indexes[0].returns[2]);
  assert.equal(result.indexes[0].values.length, 60);
  const missing = indexComparison([{code:'a',name:'a',series:dates.slice(30).map(date=>({date,close:100}))}], dates, 60);
  assert.ok(missing.indexes[0].values.every(v => v === null));
});
test('5/20/60-day returns use exact calendar endpoints, missing dates cannot shorten periods', () => {
  const dates = Array.from({length:61}, (_,i)=>`d${i}`);
  const series = dates.map((date,i)=>({date,close:100+i}));
  const result = indexComparison([{code:'a',name:'a',series:series.filter(r=>r.date!=='d40')}],dates,20).indexes[0];
  assert.equal(result.returns[1],null);
  assert.equal(Math.round(result.returns[2]),60);
  assert.ok(result.returns[0]>0);
});
test('relative change preserves zero, rejects missing, invalid and nonpositive baselines', () => {
  assert.equal(relativeChange(0,100),-100);
  assert.equal(relativeChange(100,100),0);
  for(const base of [null, undefined, 0, -5, NaN, Infinity]) assert.equal(relativeChange(100,base),null);
  assert.equal(relativeChange(null,100),null);
});
test('zero or invalid index prices remain missing rather than becoming a false crash', () => {
  const result = indexComparison([{code:'a',name:'a',series:[{date:'d1',close:100},{date:'d2',close:0},{date:'d3',close:NaN}]}], ['d1','d2','d3'], 730);
  assert.deepEqual(result.indexes[0].values,[0,null,null]);
  assert.equal(result.indexes[0].change,null);
});
test('breadth change means percentage points and never jumps over missing prior days', () => {
  const r = (ratio)=>({date:'d', data:ratio==null?null:{ma20:{ratio},ma60:{ratio}}});
  assert.equal(breadthDelta([r(0),r(20)],'ma20'),20);
  assert.equal(breadthDelta([r(60),r(null),r(20)],'ma20'),null);
  assert.equal(breadthDelta([r(20)],'ma60'),null);
});

// Included here so the existing frontend CI entry point covers overview regressions.
require('./test-overview-charts.cjs');
require('./test-market-extremes.cjs');
