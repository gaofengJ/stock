const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/analysis/components/market-extremes.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function('exports', code)(exportsObject);
const { extremeSummary, extremeValues, extremeMean } = exportsObject;
const measure = (high, low = 0, highRatio = high) => ({high, low, highRatio, lowRatio:low, eligible:100, excluded:0});
const response = (snapshot, series) => ({date:'2026-09-30',scope:'all',period:20,ready:!!snapshot,snapshot,series,items:[]});

test('current valid snapshot takes precedence, including real zero', () => {
  const data = response(measure(0), [{date:'2026-09-29',data:measure(20)}]);
  assert.deepEqual(extremeSummary(data), {date:'2026-09-30',data:measure(0)});
});
test('stale selected day exposes latest valid summary with its actual date, never a future or missing point', () => {
  const data = response(null, [
    {date:'2026-09-28',data:measure(164,1826)},
    {date:'2026-09-30',data:null},
    {date:'2026-10-01',data:measure(999)},
    {date:'2026-09-29',data:measure(225,700)},
  ]);
  const before = JSON.stringify(data);
  assert.deepEqual(extremeSummary(data), {date:'2026-09-29',data:measure(225,700)});
  assert.equal(JSON.stringify(data), before);
});
test('same-day series summary is usable without relabelling an older day', () => {
  assert.equal(extremeSummary(response(null,[{date:'2026-09-30',data:measure(3)}])).date,'2026-09-30');
  assert.equal(extremeSummary(response(null,[{date:'2026-09-30',data:null}])),null);
  assert.equal(extremeSummary(null),null);
});
test('mean exists only for the one selected curve and includes zero but not missing data', () => {
  const series = [measure(0,20),null,measure(30,40)].map((data,i)=>({date:String(i),data}));
  assert.equal(extremeMean(series,'count',{}),null);
  assert.equal(extremeMean(series,'count',{'新高':false,'新低':false}),null);
  assert.deepEqual(extremeMean(series,'count',{'新低':false}),{key:'high',value:15});
  assert.deepEqual(extremeMean(series,'count',{'新高':false}),{key:'low',value:30});
  assert.equal(extremeMean([{date:'d',data:null}],'count',{'新低':false}),null);
});
test('ratio mode uses daily ratios rather than counts, retaining gaps and rejecting invalid values', () => {
  const series = [measure(100,0,0), measure(200,0,null), measure(300,0,12), measure(400,0,NaN)].map((data,i)=>({date:String(i),data}));
  assert.deepEqual(extremeValues(series,'high','ratio'),[0,null,12,null]);
  assert.deepEqual(extremeMean(series,'ratio',{'新低':false}),{key:'high',value:6});
  assert.deepEqual(extremeMean(series,'count',{'新低':false}),{key:'high',value:250});
});
