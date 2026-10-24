const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function harness(reuse = true) {
  const slots = []; const dependencies = []; const requests = [];
  let cursor = 0; let effectCursor = 0; let effects = []; let latest = 0;
  const selection = {date:'2026-10-23',scope:'all',days:20,status:{revision:'one'}};
  const config = {};
  const runner = {
    requestConfig: config,
    async runLatestRequest(options) {
      const id = ++latest;
      options.onStart?.();
      try { const result = await options.request(); if(id===latest) options.onSuccess(result); }
      catch(e) { if(id===latest) options.onError?.(e); }
      finally { if(id===latest) options.onFinally?.(); }
    },
  };
  const react = {
    useState(initial) { const i=cursor++; if(!(i in slots))slots[i]=initial; return [slots[i], next=>{slots[i]=typeof next==='function'?next(slots[i]):next;}]; },
    useRef(initial) { const i=cursor++; if(!(i in slots))slots[i]={current:initial}; return slots[i]; },
    useEffect(effect, deps) { const i=effectCursor++; if(!dependencies[i]||deps.some((v,j)=>v!==dependencies[i][j]))effects.push(effect); dependencies[i]=deps; },
    useCallback(fn) { return fn; }, useId() { return 'fixture'; },
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/app/analysis/components/useMarketData.ts'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  }).outputText;
  const exports={};
  new Function('exports','require',code)(exports,name=>{
    if(name==='react')return react;
    if(name==='./MarketContext')return {useMarket:()=>selection};
    if(name==='@/api/errors')return {errorMessage:()=> 'failed'};
    if(name==='@/hooks/useLatestRequest')return {useLatestRequest:()=>runner};
    if(name==='@/api/market')return {marketRequest:(_endpoint,params)=>new Promise((resolve,reject)=>requests.push({params,resolve,reject}))};
    throw Error(name);
  });
  return {
    selection, requests,
    render(enabled=true, extra={}) {
      cursor=0;effectCursor=0;effects=[];
      const result=exports.default('chains',extra,enabled,reuse);
      effects.forEach(effect=>effect());return result;
    },
    async complete(index, data={ready:true}) {requests[index].resolve({data});await new Promise(setImmediate);},
    async fail(index) {requests[index].reject(new Error('fixture'));await new Promise(setImmediate);},
  };
}

test('tab revisits reuse successful data and an in-flight request for the exact selection',async()=>{
  const h=harness();h.render();h.render(false);h.render();
  assert.equal(h.requests.length,1,'returning during loading must not duplicate the request');
  await h.complete(0);h.render();h.render(false);const result=h.render();
  assert.equal(h.requests.length,1);assert.equal(result.loading,false);assert.equal(result.data.ready,true);
});
test('revision, scope, date, history range, filters and retry all invalidate tab reuse',async()=>{
  const h=harness();h.render();await h.complete(0);h.render();
  const changes=[()=>{h.selection.status.revision='two';},()=>{h.selection.scope='hs';},()=>{h.selection.date='2026-10-22';},()=>{h.selection.days=60;}];
  for(const change of changes){const count=h.requests.length;change();h.render();assert.equal(h.requests.length,count+1);await h.complete(count);h.render();}
  h.render(true,{sector:'881101.TI'});await h.complete(5);let result=h.render(true,{sector:'881101.TI'});
  result.retry();h.render(true,{sector:'881101.TI'});assert.equal(h.requests.length,7);
});
test('returning to an earlier selection while another request is pending cannot display stale results',async()=>{
  const h=harness();h.render();await h.complete(0,{value:'A'});h.render();
  h.selection.date='2026-10-22';h.render();h.selection.date='2026-10-23';h.render();
  assert.equal(h.requests.length,3);await h.complete(1,{value:'stale-B'});await h.complete(2,{value:'current-A'});
  const result=h.render();assert.equal(result.loading,false);assert.equal(result.data.value,'current-A');
});
test('a failed fetch remains retryable on revisit; non-opted-in consumers retain their existing refresh behavior',async()=>{
  const h=harness();h.render();await h.fail(0);h.render(false);h.render();assert.equal(h.requests.length,2);
  const legacy=harness(false);legacy.render();await legacy.complete(0);legacy.render(false);legacy.render();assert.equal(legacy.requests.length,2);
});
