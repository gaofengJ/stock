/* CI-only: virtual production origins are fulfilled with localhost artifacts and synthetic data. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {createFixture}=require('./fixtures/review-workflow.cjs');
const base=process.env.FRONT_TEST_URL||'http://127.0.0.1:8087';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local fixture server required');
(async()=>{
 const browser=await chromium.launch({headless:true});const context=await browser.newContext();const fixture=createFixture();
 const legacy='https://14.103.103.4', canonical='https://stock.mufengtongxue.com';
 const errors=[];
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(![legacy,canonical].includes(url.origin))return route.abort();
  if(url.pathname.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:JSON.stringify(await fixture.handle(url.href,route.request().method()))});
  const response=await fetch(base+url.pathname+url.search);return route.fulfill({status:response.status,contentType:response.headers.get('content-type')||'text/plain',body:Buffer.from(await response.arrayBuffer())});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(legacy+'/domain-transfer/');
  await page.evaluate(async()=>{
   localStorage.setItem('stock-review-draft:v1:1:2026-10-23','{"focus":"KEEP PRIVATE"}');
   localStorage.setItem('personal-ai-model:1','{"model":"gpt-6.1-sol","effort":"high"}');
   localStorage.setItem('personal-ai-model:999','OTHER ACCOUNT');
   localStorage.setItem('stock_session','NEVER EXPORT');
   await new Promise((resolve,reject)=>{const r=indexedDB.open('stock-notebook-recovery-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onerror=reject;r.onsuccess=()=>{const db=r.result;const t=db.transaction('drafts','readwrite');t.objectStore('drafts').put({revision:3,generation:0,savedAt:'2026-10-23',content:{private:{lesson:'PRIVATE NOTE'},public:{}}},'1:2026-10-23');t.oncomplete=()=>{db.close();resolve()};};});
  });
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载旧地址本机草稿',exact:true}).click();const download=await pending;
  const archive=await require('node:fs/promises').readFile(await download.path(),'utf8');assert.ok(archive.includes('PRIVATE NOTE'));assert.ok(!archive.includes('NEVER EXPORT'));
  await page.goto(canonical+'/domain-transfer/');
  await page.getByRole('button',{name:'选择恢复文件',exact:true}).waitFor();
  await page.evaluate(()=>localStorage.setItem('personal-ai-model:1','DOMAIN PREFERENCE'));
  await page.locator('input[type=file]').setInputFiles({name:'recovery.json',mimeType:'application/json',buffer:Buffer.from(archive)});
  await page.getByText(/已恢复 2 项，保留本机已有内容 1 项，跳过其他账号内容 1 项/).waitFor();
  assert.deepEqual(await page.evaluate(()=>({draft:localStorage.getItem('stock-review-draft:v1:1:2026-10-23'),model:localStorage.getItem('personal-ai-model:1'),other:localStorage.getItem('personal-ai-model:999')})),{draft:'{"focus":"KEEP PRIVATE"}',model:'DOMAIN PREFERENCE',other:null});
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('stock-notebook-recovery-v1',1);r.onsuccess=()=>{const db=r.result;const q=db.transaction('drafts').objectStore('drafts').get('1:2026-10-23');q.onsuccess=()=>{db.close();resolve(q.result.content.private.lesson)};};})),'PRIVATE NOTE');
  await page.goto(legacy+'/domain-transfer/');assert.equal(await page.evaluate(()=>localStorage.getItem('stock-review-draft:v1:1:2026-10-23')),'{"focus":"KEEP PRIVATE"}');
  assert.deepEqual(errors,[]);assert.equal(fixture.state.submissions.length,0);console.log('Domain recovery: original preserved, account isolated, existing drafts retained, no credential transfer or model calls');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
