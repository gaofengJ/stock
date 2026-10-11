const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
function load(relative, mocks={}) { const file=path.resolve(__dirname,relative), exp={}; new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exp, key => key in mocks ? mocks[key] : key==='@nestjs/common' ? {BadRequestException:Error} : load(path.relative(__dirname,path.resolve(path.dirname(file),key+'.ts')),mocks)); return exp; }
const exp=load('../src/app/review/notebook-model.ts');
test('both public outputs exclude every internal field and preserve only explicit public writing',()=>{
 const c=exp.emptyNotebook();for(const key of Object.keys(c.private))c.private[key]='PRIVATE_SENTINEL_'+key;
 c.public.summary='Visible view';c.public.sources='Visible source';
 for(const mode of ['wechat','xueqiu']){const t=exp.publicText('2026-09-30',c,mode);assert.ok(t.includes('Visible view'));assert.ok(!t.includes('PRIVATE_SENTINEL'));}
 assert.ok(exp.internalText('2026-09-30',c).includes('PRIVATE_SENTINEL_execution'));
});
test('rich text export escapes scripts, images and attributes rather than executing them',()=>{
 const html=exp.noteHtml('# <script>alert(1)</script>\n<img src=x onerror=alert(1)>');
 assert.ok(!html.includes('<script>')&&!html.includes('<img'));assert.ok(html.includes('&lt;script&gt;'));
});
test('published snapshot matches the preview and never imports private writing', () => {
 const server = load('../../back/src/modules/review/notebook.content.ts');
 const c = exp.emptyNotebook();
 for (const k of Object.keys(c.private)) c.private[k] = 'PRIVATE_' + k;
 for (const k of Object.keys(c.public)) c.public[k] = 'PUBLIC_' + k;
 for (const channel of ['wechat','xueqiu']) {
   assert.equal(exp.publicText('2026-09-30', c, channel), server.publicationText('2026-09-30', c, channel));
   assert.ok(!server.publicationText('2026-09-30', c, channel).includes('PRIVATE_'));
 }
 const saved = server.parseNotebook(JSON.stringify(c));
 assert.deepEqual(saved, c, 'existing notebook fields survive the workflow change');
 assert.ok(exp.internalText('2026-09-30', saved).includes('PRIVATE_candidates'));
});

const contract=load('../src/app/review/article-contract.ts');
const serverContract=load('../../back/src/modules/review/article-contract.ts');
const handoff=load('../src/app/review/article-handoff.ts');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';
function illustrated(){const c=exp.emptyNotebook(); c.private.execution='PRIVATE_SECRET';c.article={body:'# 日报\n\n## 市场\n数据\n\n## 计划\n等待验证',feishuUrl:'',images:[{id:'chart-1',data:png,caption:'市场图',source:'行情日期 2026-09-30',after:'市场'}]};return c;}
test('illustrated versions round trip images and source, export to offline HTML, exclude private data',()=>{
 const c=illustrated(), server=load('../../back/src/modules/review/notebook.content.ts');
 assert.deepEqual(server.parseNotebook(JSON.stringify(c)),c);
 const t=exp.publicText('2026-09-30',c,'wechat'); assert.ok(t.indexOf('review-image:chart-1')<t.indexOf('## 计划'));
 const html=exp.noteHtml(t,c.article.images);assert.ok(html.includes(png)&&html.includes('市场图')&&html.includes('行情日期'));
 assert.ok(!html.includes('PRIVATE_SECRET'));
 const packet=handoff.reviewPacket('2026-09-30',4,c);assert.ok(!JSON.stringify(packet).includes('PRIVATE_SECRET'));
 assert.deepEqual(handoff.readResult(JSON.stringify(packet),'2026-09-30',4),c.article);
 assert.throws(()=>handoff.readResult(JSON.stringify(packet),'2026-09-29',4),/日期或版本/);
 assert.throws(()=>handoff.readResult(JSON.stringify(packet),'2026-09-30',5),/日期或版本/);
});
test('browser and server reject duplicate, unsafe, oversize images and untrusted document URLs',()=>{
 for(const validator of [contract.validateArticle,serverContract.validateArticle]){
  const a=illustrated().article;assert.deepEqual(validator(a),a);
  assert.throws(()=>validator({...a,images:[...a.images,...a.images]}));
  for(const data of ['https://evil.invalid/pixel','data:image/svg+xml;base64,PHN2Zz4=',png+'!'])assert.throws(()=>validator({...a,images:[{...a.images[0],data}]}));
  assert.throws(()=>validator({...a,body:'x'.repeat(40001)}));
  assert.throws(()=>validator({...a,feishuUrl:'https://feishu.cn.evil.invalid/docx/abc'}));
  assert.throws(()=>validator({...a,images:Array.from({length:21},(_,i)=>({...a.images[0],id:String(i)}))}));
 }
});
test('partial source errors remain explicit and wrong dates never enter research',async()=>{
 const market={snapshot:{amount:100,up:50,down:20,flat:1,limitUp:3,limitDown:1,broken:2,maxHeight:4},indexes:[]};
 const research=load('../src/app/review/research.ts',{'@/api/request':{default:{get:async()=>({data:{date:'2026-09-30',items:[]}})}},'@/api/market':{marketRequest:async(endpoint)=>{if(endpoint==='overview')return {data:{date:'2026-09-29',...market}};if(endpoint==='sentiment')return {data:{date:'2026-09-30',...market}};throw Error('fixture unavailable');}},'@/utils/format':{numberText:v=>v==null?'—':String(v)}});
 const r=await research.loadResearch('2026-09-30');assert.equal(r.sections.find(x=>x.key==='market').state,'missing');assert.equal(r.sections.find(x=>x.key==='sentiment').state,'ready');
 assert.equal(r.sections.length,6);assert.ok(!r.sections.some(x=>['news','dragon'].includes(x.key)));assert.ok(r.sections.find(x=>x.key==='sentiment').text.includes('涨停 3 家'));
 assert.deepEqual(contract.validateResearch(r),serverContract.validateResearch(r));
});

const materialsContract=load('../src/app/review/materials-contract.ts');
test('v2 preserves user words, separates context, and includes execution only by explicit choice',()=>{
 const c=exp.emptyNotebook(); c.private.marketJudgment='我的判断，保持原文。\n第二行';c.private.lesson='不要追涨';c.private.execution='PRIVATE_TRADE';c.private.toolEvidence='股票 000001.SZ 的原始观察';
 c.materials={links:[{id:'link1',title:'自选图',url:'https://example.com/chart',note:'取日线图'}],calendar:[{id:'event1',date:'2026-10-12',title:'展会',detail:'相关题材',source:'https://example.com/event'}],showCalendar:false,includeExecution:false};
 c.research={date:'2026-09-30',fetchedAt:'2026-09-30T12:00:00Z',sections:[{key:'market',title:'大盘',source:'/analysis/overview?date=2026-09-30',text:'GENERIC_MARKET',state:'ready',points:[],unit:''},{key:'themes',title:'题材',source:'/analysis/limits?date=2026-09-30',text:'THEME',state:'ready',points:[],unit:''},{key:'news',title:'新闻',source:'/news?date=2026-09-30',text:'OLD_NEWS',state:'ready',points:[],unit:''}]};
 let p=handoff.reviewPacket('2026-09-30',1,c,'https://stock.example.com');
 assert.equal(p.schema,'stock-review/v2');assert.equal(p.article.body,'');assert.equal(p.userNotes.find(n=>n.key==='marketJudgment').text,c.private.marketJudgment);
 assert.ok(!p.userNotes.some(n=>n.key==='themes'));assert.ok(!JSON.stringify(p).includes('PRIVATE_TRADE'));assert.ok(!JSON.stringify(p.research).includes('GENERIC_MARKET'));assert.ok(JSON.stringify(p.context).includes('GENERIC_MARKET'));assert.ok(!JSON.stringify(p).includes('OLD_NEWS'));
 assert.equal(p.materials.calendar.length,1,'hiding the calendar preserves selected events');assert.ok(p.materials.links.some(l=>l.url==='https://stock.example.com/basic/stock/detail/?code=000001.SZ&date=2026-09-30'));
 c.materials.includeExecution=true;p=handoff.reviewPacket('2026-09-30',1,c);assert.equal(p.userNotes.find(n=>n.key==='execution').text,'PRIVATE_TRADE');
 const server=load('../../back/src/modules/review/notebook.content.ts');assert.deepEqual(server.parseNotebook(JSON.stringify(c)),c);
});
test('material contract is identical on client and server, rejects executable links and duplicate IDs',()=>{
 const server=load('../../back/src/modules/review/materials-contract.ts');
 const m={links:[{id:'a',title:'t',url:'https://example.com/a',note:'n'}],calendar:[],showCalendar:true,includeExecution:false};
 for(const validate of [materialsContract.validateMaterials,server.validateMaterials]){
   assert.deepEqual(validate(m),m);
   assert.throws(()=>validate({...m,links:[...m.links,...m.links]}));
   for(const url of ['javascript:alert(1)','data:image/png;base64,abc','https://user:pass@example.com/a'])assert.throws(()=>validate({...m,links:[{...m.links[0],url}]}));
 }
});
const {createChartLoader}=load('../src/app/strategy/chart-loader.ts');
test('chart prefetch and foreground share one request, cancellation is isolated, cache expires',async()=>{
 let time=0;const pending=[];const loader=createChartLoader((params,signal)=>new Promise((resolve,reject)=>{pending.push({params,signal,resolve,reject});signal.addEventListener('abort',()=>reject(Object.assign(new Error('abort'),{code:'ERR_CANCELED'})));}),()=>time);
 const a=loader.acquire({code:'A',date:'D'}); a.release();const b=loader.acquire({date:'D',code:'A'});await Promise.resolve();assert.equal(pending.length,1);assert.equal(pending[0].signal.aborted,false,'switching into an active prefetch must not abort it');
 pending[0].resolve({code:'A'});assert.equal((await b.promise).code,'A');b.release();
 const cached=loader.acquire({code:'A',date:'D'});await cached.promise;cached.release();assert.equal(pending.length,1);
 time=60001;const fresh=loader.acquire({code:'A',date:'D'});assert.equal(pending.length,2);fresh.promise.catch(()=>{});fresh.release();await Promise.resolve();assert.equal(pending[1].signal.aborted,true);
 const c=loader.acquire({code:'B',date:'D'});const d=loader.acquire({code:'C',date:'D'});c.promise.catch(()=>{});c.release();await Promise.resolve();assert.equal(pending[2].signal.aborted,true);assert.equal(pending[3].signal.aborted,false);pending[3].resolve({code:'C'});await d.promise;d.release();
});
test('transient chart failure retries once; business and auth failures are never retried or cached',async()=>{
 for(const status of [401,403,409,502]){let count=0;const loader=createChartLoader(async()=>{count++;throw {response:{status}};});const task=loader.acquire({code:'A'});await assert.rejects(task.promise);task.release();assert.equal(count,status===502?2:1);const next=loader.acquire({code:'A'});await assert.rejects(next.promise);next.release();assert.equal(count,status===502?4:2);}
});

test('v2 result import preserves original notes and images and requires independent analysis',()=>{
 const c=illustrated();c.private.lesson='我的经验，原样保留';
 const p=handoff.reviewPacket('2026-09-30',4,c);
 const valid={...p,article:{...p.article,body:'# 图文\n\n## 用户记录\n我的经验，原样保留\n\n## AI 分析\n依据图片补充的独立分析。'}};
 assert.equal(handoff.readResult(JSON.stringify(valid),p.date,4,c).body,valid.article.body);
 assert.throws(()=>handoff.readResult(JSON.stringify({...valid,article:{...valid.article,body:'## AI 分析\n只有分析。'}}),p.date,4,c),/原文/);
 assert.throws(()=>handoff.readResult(JSON.stringify({...valid,article:{...valid.article,body:'我的经验，原样保留'}}),p.date,4,c),/AI 分析/);
 assert.throws(()=>handoff.readResult(JSON.stringify({...valid,article:{...valid.article,images:[]}}),p.date,4,c),/配图/);
});
