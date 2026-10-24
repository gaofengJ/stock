/* Local browser regression. API writes stay inside fixtures. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.FRONT_TEST_URL || 'http://127.0.0.1:8088';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local fixture server required');
const output = process.env.TEST_ARTIFACT_DIR || '/tmp/stock-review-handoff';
fs.mkdirSync(output, { recursive: true });
const date = '2026-10-13';
const items = Array.from({length:30}, (_,i) => ({tsCode:`${String(i+1).padStart(6,'0')}.SZ`,name:`测试股份${i+1}`,capState:'within',totalMv:100000+i*10000,circMv:50000+i*1000,close:10+i,strategies:[{key:'trend',label:'连续三日收阳'}]}));
const user = {id:1,username:'mufeng',nickname:'测试账户',roles:[{code:'admin'}],permissions:['/review'],catalog:[{code:'/review',route:'/review',name:'每日复盘',group:'fixture'}]};
async function verify(browser, mode) {
  const context = await browser.newContext({ viewport:{width:1600,height:1050}, permissions:['clipboard-read','clipboard-write'] });
  context.setDefaultNavigationTimeout(20000);
  context.setDefaultTimeout(20000);
  await context.addInitScript(mode => {
    localStorage.setItem('stock-theme', mode);
    window.__copyMode = 'real';
    const writeText = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = text => window.__copyMode === 'pending' ? new Promise(() => {}) : writeText(text);
    const exec = document.execCommand.bind(document);
    document.execCommand = (...args) => window.__copyMode === 'pending' ? false : exec(...args);
  }, mode);
  const initialRevision = mode === 'light' ? 0 : 3;
  let revision = initialRevision; let writes = []; let failSave = false; let held;
  await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  await context.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data = {items:[],sources:[]};
    if (path === '/api/auth/access') data = {user,trial:null};
    if (path === '/api/auth/csrf') data = {csrfToken:'fixture-only'};
    if (path === '/api/common/all-options') data = {};
    if (path === '/api/basic/trade-cal/list') data = [{calDate:date,isOpen:1}];
    if (path === '/api/review/notebook') {
      if (route.request().method() === 'POST') {
        writes.push(route.request().postDataJSON());
        if (failSave) return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({code:-1,message:'fixture revision conflict'})});
        if (held === 'hold') {held=route;return;}
        data = {revision:++revision};
      } else data = {date,revision,generation:2,content:null};
    }
    if (path === '/personal-ai/api/status') data = {enabled:false,tasks:[],metadata:null,today:{calls:0,tokens:0},limits:{dailyCalls:20,dailyTokens:200000}};
    if (path === '/api/review/notebook/dates') data = [];
    if (path === '/api/review/report') data = {date,complete:true,items,strategies:[{key:'trend',label:'连续三日收阳',state:'ready'}]};
    if (path.includes('financial')) data = {items:items.map(row=>({...row,status:'profit',amount:100,reportDate:'2026-06-30',announcedAt:date,sourceState:'ready',forecastState:'ready',history:[],forecast:null})),sources:[]};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(path.startsWith('/personal-ai/')?data:{code:0,data})});
  });
  const page = await context.newPage(); const errors = []; const dialogs = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());await dialog.dismiss();});
  await page.goto(`${base}/review/?date=${date}`,{waitUntil:'networkidle'});
  const topGap = await page.evaluate(()=>document.querySelector('.review-page').getBoundingClientRect().top-document.querySelector('.platform-content').getBoundingClientRect().top);
  assert.ok(topGap >= 16 && topGap < 150, 'review content remains below the context bar');
  assert.equal(await page.getByRole('button',{name:'智能复盘',exact:true}).count(),0);
  await page.getByText('添加或调整观察股票',{exact:true}).click();
  const input = page.locator('#note-marketJudgment');
  await input.fill('必须保留的最新用户原文');
  await page.locator('#review-candidate-table .ant-pagination-item-2 a').click();
  await page.locator('#review-candidate-table .ant-pagination-item-active').filter({hasText:'2'}).waitFor();
  assert.deepEqual(dialogs, [], 'pagination cannot ask to abandon edits');
  await page.waitForTimeout(1200);
  await page.locator('.platform-content').evaluate(node=>{const bar=document.querySelector('.review-selection');node.scrollTop+=bar.getBoundingClientRect().top-node.getBoundingClientRect().top+150;});
  await page.waitForTimeout(1200);
  const metrics = await page.evaluate(()=>{const bar=document.querySelector('.review-selection'),header=document.querySelector('#review-candidate-table .ant-table-sticky-holder');return {position:getComputedStyle(bar).position,headerTop:header.getBoundingClientRect().top,scrollTop:document.querySelector('.notebook-toolbar').getBoundingClientRect().bottom,headerBackground:getComputedStyle(header.querySelector('th')).backgroundColor};});
  await page.screenshot({path:`${output}/sticky-${mode}.png`});
  assert.equal(metrics.position,'static');
  assert.notEqual(metrics.headerBackground,'rgba(0, 0, 0, 0)');
  assert.ok(Math.abs(metrics.scrollTop-metrics.headerTop)<2,JSON.stringify(metrics));
  await page.screenshot({path:`${output}/sticky-${mode}.png`});
  // Verify a genuine same-tab navigation is still guarded.
  await page.evaluate(()=>{const a=document.createElement('a');a.href='/analysis/overview/';a.textContent='fixture leave';a.id='fixture-leave';document.querySelector('.review-notebook').appendChild(a);});
  await page.locator('#fixture-leave').click();
  await page.getByRole('dialog').getByText('离开前处理未保存复盘').waitFor();
  await page.getByRole('button',{name:'继续编辑',exact:true}).click();
  assert.equal(dialogs.length,0);assert.ok(page.url().includes('/review/'));
  await page.getByRole('link',{name:'图文制作与 AI 辅助',exact:true}).click();
  await page.getByRole('button',{name:'保留本机草稿并离开',exact:true}).click();
  await page.waitForURL('**/admin/ai/**');
  await page.getByText('核对本日原始记录（可选）',{exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#note-marketJudgment')?.value==='必须保留的最新用户原文');
  await page.getByRole('checkbox',{name:'文档包含持仓与操作记录'}).check();
  const handoff = page.locator('.notebook-handoff');
  assert.equal(await handoff.getByRole('button',{name:/^保\s*存$/}).count(),1);
  await handoff.getByRole('button',{name:/^预\s*览$/}).click();
  await page.getByRole('dialog').getByText('当前只包含记录与配图。点击“智能复盘”即可生成正文。').waitFor();
  assert.equal(writes.length,0,'preview must not save');
  await page.getByRole('dialog').getByRole('button',{name:/关\s*闭/}).click();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.platform-content')).overflowY !== 'hidden');
  const downloadPromise = page.waitForEvent('download');
  await handoff.getByRole('button',{name:'准备 Codex 任务',exact:true}).click();
  await handoff.getByText('任务已复制，资料包已发起下载。请在 Codex 粘贴任务并附上资料包后发送。',{exact:true}).waitFor();
  assert.equal(await page.locator('.notebook-panel .ant-alert').filter({hasText:'任务已复制，资料包已发起下载。'}).count(),1);
  assert.equal(writes.length,1);
  const packetDownload = await downloadPromise;
  assert.equal(packetDownload.suggestedFilename(),`${date}-review-v${initialRevision+1}.json`);
  const packet = JSON.parse(fs.readFileSync(await packetDownload.path(),'utf8'));
  assert.ok(JSON.stringify(packet).includes('必须保留的最新用户原文'));
  assert.equal(writes[0].revision,initialRevision);
  assert.equal(writes[0].generation,2);
  const clipboard = await page.evaluate(()=>navigator.clipboard.readText());
  assert.ok(clipboard.includes(`保存版本 ${initialRevision + 1}`));
  assert.ok(clipboard.includes('必须保留的最新用户原文'));
  assert.ok(clipboard.includes('执行记录授权：仅限私人飞书文档'));
  assert.equal(await page.getByRole('textbox',{name:'Skill 任务文本'}).inputValue(),clipboard.replace(/\r\n/g,'\n'));
  await page.screenshot({path:`${output}/handoff-${mode}.png`});
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>{window.__copyMode='pending';});
  await handoff.getByRole('button',{name:'准备 Codex 任务',exact:true}).click();
  const manual = page.getByRole('textbox',{name:'Skill 任务文本'});
  await manual.waitFor({timeout:7000});
  assert.equal(await manual.inputValue(),clipboard.replace(/\r\n/g,'\n'));
  await page.screenshot({path:`${output}/manual-${mode}.png`});
  await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>{window.__copyMode='real';});
  await input.fill('保存失败也不能丢失的原文');
  failSave=true;
  await handoff.getByRole('button',{name:'准备 Codex 任务',exact:true}).click();
  await handoff.getByText('尚未完成保存，请检查页面提示后重试。新的修改会继续保留。').waitFor();
  assert.equal(await input.inputValue(),'保存失败也不能丢失的原文');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),clipboard);
  failSave=false; held='hold';
  await handoff.getByRole('button',{name:'准备 Codex 任务',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.notebook-handoff .ant-btn-loading'));
  for (let i=0;i<100 && held==='hold';i++) await page.waitForTimeout(20);
  assert.notEqual(held,'hold');
  await input.fill('保存过程中继续输入的新内容');
  await held.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data:{revision:++revision}})});
  await handoff.getByText('尚未完成保存，请检查页面提示后重试。新的修改会继续保留。').waitFor();
  assert.equal(await input.inputValue(),'保存过程中继续输入的新内容');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),clipboard);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${mode}: single sticky header, pagination, real leave guard, save/copy exact revision, timeout fallback, failed and concurrent saves`);
  await context.close();
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
  try { await verify(browser,'dark'); await verify(browser,'light'); }
  catch(error) {
    for(const context of browser.contexts()) for(const page of context.pages()) {
      await page.screenshot({path:`${output}/handoff-failure.png`,timeout:5000}).catch(()=>{});
      console.error(page.url(),await page.locator('body').innerText().catch(()=>'No page'));
    }
    throw error;
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
