/* CI only: local static export, synthetic data and accounts, no production traffic. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const base = process.env.FRONT_TEST_URL || 'http://127.0.0.1:8087';
if (!['127.0.0.1','localhost'].includes(new URL(base).hostname)) throw Error('Local fixture server required');
const output = process.env.TEST_ARTIFACT_DIR || '/tmp/stock-chains-browser';
fs.mkdirSync(output,{recursive:true});
const date='2026-10-23';
const dates=Array.from({length:20},(_,i)=>new Date(Date.UTC(2026,9,4+i)).toISOString().slice(0,10));
const status={revision:'chains-fixture',latestDate:date,expectedDate:date,dates,stages:[],backfill:null};
const user={id:1,username:'fixture',nickname:'测试账户',roles:[],permissions:['analysis:chains'],catalog:[{code:'analysis:chains',route:'/analysis/chains',name:'连板分析',group:'分析'}]};
const stats={amount:1e4,limitAmount:100,chainAmount:40,maxHeight:6,counts:[40,6,2,1],upgrades:[1,2,3,4].map(from=>({from,rate:50,numerator:1,denominator:2}))};
const stocks=Array.from({length:1000},(_,i)=>({tsCode:`${String(i+1).padStart(6,'0')}.SZ`,name:`轨迹测试${i+1}`,cells:dates.map(day=>({date:day,state:'2板',height:2,pctChg:10,close:12,amount:1}))}));

(async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(20000);
  const requests=[];const errors=[];const navigationRequests=[];
  let page;
  try {
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await context.route('**/api/**',async route=>{
      const url=new URL(route.request().url());const path=url.pathname;
      let data={};
      if(path==='/api/auth/access')data={user,trial:null};
      if(path==='/api/auth/csrf')data={csrfToken:'fixture'};
      if(path==='/api/feedback/unread')data={unread:false};
      if(path==='/api/basic/trade-cal/list')data=dates.map(calDate=>({calDate,isOpen:1}));
      if(path==='/api/analysis/market/status')data=status;
      if(path==='/api/analysis/market/sector-options')data={items:[]};
      if(path==='/api/analysis/market/chains'){
        requests.push({endpoint:'chains',days:Number(url.searchParams.get('days'))});
        data={date,status,snapshot:stats,series:dates.map(day=>({date:day,data:stats})),indexes:[],markets:[]};
      }
      if(path==='/api/analysis/market/ladder'){
        requests.push({endpoint:'ladder'});
        data={ready:true,items:[{tsCode:'000001.SZ',name:'梯队测试',limitTimes:2}],transitions:[{tsCode:'000001.SZ',name:'梯队测试',previousHeight:1,height:2,pctChg:10,state:'晋级'}]};
      }
      if(path==='/api/analysis/market/trajectories'){
        const count=Number(url.searchParams.get('trajectoryDays'));
        requests.push({endpoint:'trajectories',count,code:url.searchParams.get('code')});
        const shown=dates.slice(-count);const code=url.searchParams.get('code');
        data={ready:true,date,dates:shown,items:stocks.filter(r=>!code||r.tsCode===code).map(r=>({...r,cells:r.cells.filter(c=>shown.includes(c.date))}))};
      }
      await route.fulfill({contentType:'application/json',body:JSON.stringify({code:0,data})});
    });
    page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(new URL(request.url()).searchParams.has('_rsc'))navigationRequests.push(request.url());});
    await page.goto(`${base}/analysis/chains/?date=${date}&scope=all`,{waitUntil:'networkidle'});
    await page.locator('.chains-transitions-table .stock-identity-name').waitFor();
    assert.deepEqual(requests.filter(r=>r.endpoint==='chains').map(r=>r.days),[20],'ladder must not request two years');
    assert.equal(requests.filter(r=>r.endpoint==='trajectories').length,0,'inactive trajectory is lazy');
    await page.getByRole('tab',{name:'多日轨迹',exact:true}).click();
    await page.locator('.trajectory-cell').first().waitFor();
    const rendered=await page.locator('.chains-trajectory .ant-table-row').count();
    assert.ok(rendered>0&&rendered<80,`1000 stocks should mount only visible rows, got ${rendered}`);
    await page.locator('.chains-trajectory .ant-table-tbody-virtual-holder').evaluate(node=>{node.scrollTop=node.scrollHeight;});
    await page.getByText('轨迹测试1000',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'历史统计',exact:true}).click();
    await page.locator('.ant-tabs-tabpane-active canvas').first().waitFor();
    const initialCount=requests.length;const rscCount=navigationRequests.length;
    const timings=[];
    for(const label of ['当日梯队','多日轨迹','历史统计','当日梯队','多日轨迹','历史统计']){
      const started=Date.now();
      await page.getByRole('tab',{name:label,exact:true}).click();
      await page.waitForFunction(label=>Array.from(document.querySelectorAll('[role=tab]')).some(n=>n.textContent===label&&n.getAttribute('aria-selected')==='true'),label);
      timings.push(Date.now()-started);
    }
    assert.equal(requests.length,initialCount,'warm tab changes cannot refetch market data');
    assert.equal(navigationRequests.length,rscCount,'same-page tab changes cannot start route fetches');
    assert.ok(Math.max(...timings)<1500,`warm tab switch latency: ${timings}`);
    await page.locator('.market-trend-control .ant-select-selector').click();
    await page.getByText('近60个交易日',{exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.ant-tabs-tabpane-active .market-data-state[aria-busy=true]'));
    assert.ok(requests.some(r=>r.endpoint==='chains'&&r.days===60),'history range fetches selected data');
    assert.equal(requests.some(r=>r.days===730),false,'two years is never loaded implicitly');
    await page.goBack();
    await page.getByRole('tab',{name:'多日轨迹',exact:true,selected:true}).waitFor();
    await page.locator('.ant-tabs-tabpane-active .trajectory-cell').first().click();
    await page.getByRole('dialog').getByText('当日涨跌幅',{exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:/^关\s*闭$/}).click();
    await page.goto(`${base}/analysis/chains/?date=${date}&scope=all&view=trajectory&code=000001.SZ`,{waitUntil:'networkidle'});
    assert.equal(await page.getByRole('textbox',{name:'搜索轨迹股票',exact:true}).inputValue(),'000001.SZ');
    await page.locator('.trajectory-cell').first().waitFor();
    assert.equal(await page.locator('.chains-trajectory .ant-table-row').count(),1,'stock deep link still filters trajectory');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`${output}/chains-tabs.png`});
    console.log(JSON.stringify({result:'PASS',stocks:1000,renderedRows:rendered,warmSwitchMs:timings,marketRequestsOnWarmSwitch:0,routeFetchesOnWarmSwitch:0}));
  } catch(error){
    if(page)await page.screenshot({path:`${output}/chains-tabs-failure.png`}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
