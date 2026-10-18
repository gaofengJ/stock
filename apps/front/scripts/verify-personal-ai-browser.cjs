/* Integration checks against a local static export; every API call is a fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.FRONT_TEST_URL || 'http://127.0.0.1:18185';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw Error('Local fixture server required');
const output = process.env.TEST_ARTIFACT_DIR;
const date = '2026-10-13';
const stock = {tsCode:'000001.SZ',name:'测试股份',capState:'within',close:12,totalMv:100000,circMv:50000,strategies:[]};
const owner = {id:1,username:'fixture',roles:[{code:'admin'}],permissions:['review','strategy','admin'],catalog:[{route:'/review',code:'review'},{route:'/strategy',code:'strategy'},{route:'/admin',code:'admin'}]};
const status = {enabled:true,tasks:[],metadata:{plan:'pro',models:[{model:'gpt-6.1-sol',efforts:['high']}],quota:{}},today:{calls:0,tokens:0},limits:{dailyCalls:20,dailyTokens:200000}};
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
 try {
  const context=await browser.newContext({viewport:{width:1540,height:950}}); let tasks=0;
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await context.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.startsWith('/personal-ai/')) {
    if(route.request().method()!=='GET') tasks+=1;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(status)});
   }
   let data={items:[],sources:[]};
   if(path==='/api/auth/access')data={user:owner,trial:null};
   if(path==='/api/auth/csrf')data={csrfToken:'fixture-only'};
   if(path==='/api/common/all-options')data={};
   if(path==='/api/basic/trade-cal/list')data=[{calDate:date,isOpen:1}];
   if(path==='/api/review/notebook')data={date,revision:0,generation:0,content:null};
   if(path==='/api/review/report')data={date,complete:true,items:[stock],strategies:[]};
   if(path==='/api/strategy/tabs-list')data=[{key:'fiveMaUp',name:'五线顺上',label:'五线顺上'}];
   if(path==='/api/strategy/list')data=[stock];
   if(path.includes('candidate-labels')||path.includes('candidate-context'))data=[];
   if(path.includes('candidate-environment'))data={date,market:null,breadth:null};
   await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/review/?date=${date}`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/智能复盘/}).waitFor();
  const gap=await page.evaluate(()=>document.querySelector('.review-page').getBoundingClientRect().top-document.querySelector('.platform-content').getBoundingClientRect().top);
  assert.equal(Math.round(gap),16);
  if(output){fs.mkdirSync(output,{recursive:true});await page.screenshot({path:`${output}/owner-review.png`});}
  await page.getByRole('button',{name:/智能复盘/}).click();
  const drawer=page.getByRole('dialog');await drawer.getByRole('button',{name:'开始分析',exact:true}).waitFor();
  assert.ok((await drawer.textContent()).includes(date));
  await drawer.getByRole('button',{name:'Close',exact:true}).click();
  await page.goto(`${base}/strategy/?date=${date}&strategyType=fiveMaUp`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:/智能对比/}).click();
  await page.getByRole('dialog').getByRole('combobox',{name:'对比股票',exact:true}).click();
  await page.getByText('测试股份 000001.SZ',{exact:true}).last().waitFor();
  await page.goto(`${base}/admin/ai/`,{waitUntil:'networkidle'});
  await page.getByRole('heading',{name:'模型设置',exact:true}).waitFor();
  await page.getByRole('menuitem',{name:'robot 模型设置',exact:true}).waitFor();
  assert.equal(tasks,0,'opening all three AI entries must never submit a task');
  assert.deepEqual(errors,[]);
  console.log('PASS: review/strategy/admin owner entries, date and candidate context, top padding, zero inference calls');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
