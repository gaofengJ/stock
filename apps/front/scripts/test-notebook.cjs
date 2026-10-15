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
  assert.equal(validator({...a,body:'原文'.repeat(100000)}).body.length, 200000);
  assert.throws(()=>validator({...a,body:'x'.repeat(300001)}));
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
 assert.equal(p.schema,'stock-review/v2');assert.ok(p.article.body.startsWith('# 2026-09-30复盘'));assert.equal(p.userNotes.find(n=>n.key==='marketJudgment').text,c.private.marketJudgment);
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
test('long candidate evidence survives packet export, result import and rendered copy in full',()=>{
 const c=illustrated(); c.private.toolEvidence='候选记录'.repeat(50000);
 const packet=handoff.reviewPacket('2026-09-30',4,c);
 assert.equal(packet.userNotes.find(note=>note.key==='toolEvidence').text,c.private.toolEvidence);
 const body=`# 完整复盘\n\n## 用户原文\n${c.private.toolEvidence}\n\n## AI 分析\n完整保留后补充分析。`;
 const result={...packet,article:{...packet.article,body}};
 const imported=handoff.readResult(JSON.stringify(result),packet.date,4,c);
 assert.equal(imported.body,body);
 assert.ok(exp.publicText(packet.date,{...c,article:imported},'wechat').includes(c.private.toolEvidence));
 assert.ok(exp.noteHtml(imported.body,imported.images).includes(c.private.toolEvidence));
});

const platformImages = load('../src/app/review/platform-images.ts');
test('automatic preparation only requests missing platform groups and reuses saved images', () => {
 const keys = platformImages.captureSources.map(source => source.key);
 const images = keys.map(key => ({ id: platformImages.imageId(key) }));
 assert.deepEqual(platformImages.missingPlatformImages([]), keys);
 assert.deepEqual(platformImages.missingPlatformImages(images), []);
 assert.deepEqual(platformImages.missingPlatformImages(images.filter(image => image.id !== platformImages.imageId('limits'))), ['limits']);
 assert.deepEqual(platformImages.missingPlatformImages([{id:'uploaded-user-image'}]), keys);
});
test('complete dark groups replace legacy platform slices but partial capture and uploads survive', () => {
 const old=illustrated().article;
 old.images=[{...old.images[0],id:'platform-themes-0'}, {...old.images[0],id:'platform-themes-1'}, {...old.images[0],id:'upload-1'}];
 const fresh=platformImages.captureSources.map(item=>({...old.images[0], id:platformImages.imageId(item.key)}));
 const partial=platformImages.mergePlatformImages(old,fresh.slice(0,1));
 assert.equal(partial.images.length,4);
 const complete=platformImages.mergePlatformImages(partial,fresh.slice(1));
 assert.equal(complete.images.length,5);
 assert.ok(complete.images.some(i=>i.id==='upload-1'));
 assert.ok(!complete.images.some(i=>i.id==='platform-themes-1'));
 assert.deepEqual(platformImages.missingPlatformImages(complete.images),[]);
});

test('template places platform images at their steps and preserves the exact date title and user notes',()=>{
 const c=exp.emptyNotebook();c.private.marketJudgment='用户原文';c.private.execution='PRIVATE';c.article={body:'',feishuUrl:'',images:[{id:'platform-market-0',data:png,caption:'平台原图',source:'url',after:'市场概览'}]};
 const text=exp.publicText('2026-10-12',c,'wechat');assert.ok(text.startsWith('# 2026-10-12复盘'));assert.ok(text.includes('用户原文'));assert.ok(!text.includes('PRIVATE'));
 assert.ok(text.indexOf('review-image:platform-market-0')<text.indexOf('## 涨停板复盘'));
 const p=handoff.reviewPacket('2026-10-12',1,c);assert.equal(p.title,'2026-10-12复盘');assert.equal(p.article.images[0].data,png);assert.ok(p.article.body.includes('用户原文'));
});

test('a result from before history reset cannot be imported into the same date and revision',()=>{
 const c=illustrated(), p=handoff.reviewPacket('2026-09-30',1,c,'',0);
 assert.throws(()=>handoff.readResult(JSON.stringify(p),p.date,1,undefined,1),/清空前/);
});

test('compact template has declaration, three fixed chart groups, simple candidates and empty chat',()=>{
 const c=exp.emptyNotebook();c.private.toolEvidence='研究日期：2026-10-13\n\n测试股份 001206.SZ\n策略：连续三日收阳\n观察与触发：未填写';
 const body=exp.documentTemplate('2026-10-13',c);
 assert.ok(body.includes('本文由 AI 生成，仅供参考'));assert.ok(body.includes('测试股份｜连续三日收阳'));
 assert.ok(!body.includes('未填写'));assert.ok(body.endsWith('## 闲聊\n\n'));
 assert.deepEqual(platformImages.captureSources.map(s=>s.charts.length),[4,8,4,1]);
 const image={id:'overview',data:png,caption:'概览',source:'',after:'市场概览'};
 const text=contract.illustratedText('# 复盘\n\n## 市场数据\n\n### 市场概览\n\n简要解读\n\n独立解读。',[image]);
 assert.ok(text.indexOf('review-image:overview')<text.indexOf('简要解读'));
 assert.equal(text,serverContract.illustratedText('# 复盘\n\n## 市场数据\n\n### 市场概览\n\n简要解读\n\n独立解读。',[image]));
 const p=handoff.reviewPacket('2026-10-13',1,exp.emptyNotebook());p.article={body:'简要解读\n\n独立解读。',images:[image],feishuUrl:''};
 assert.equal(handoff.readResult(JSON.stringify(p),p.date,1,exp.emptyNotebook()).body,p.article.body);
});
test('large unsliced images share the same client/server limits without relaxing total cap',()=>{
 const value=illustrated().article;value.images[0].data=png.replace(/=+$/,'')+'A'.repeat(600000);
 assert.deepEqual(contract.validateArticle(value),serverContract.validateArticle(value));
 value.images=Array.from({length:11},(_,i)=>({...value.images[0],id:'p'+i}));
 assert.throws(()=>contract.validateArticle(value));assert.throws(()=>serverContract.validateArticle(value));
});
const {selectWatchRows}=load('../src/app/review/watch-selection.ts');
test('watch selections survive page and filter changes and removal preserves unrelated picks',()=>{
 const a={tsCode:'001206.SZ',name:'A'},b={tsCode:'300637.SZ',name:'B'},c={tsCode:'301608.SZ',name:'C'};
 assert.deepEqual(selectWatchRows([a],[b,c],true),[a,b,c]);
 assert.deepEqual(selectWatchRows([a,b,c],[b,c],false),[a]);
 assert.deepEqual(selectWatchRows([a,b],[a,b],true),[a,b]);
});
const {themeRequest}=load('../src/app/analysis/limits/theme-request.ts');
test('theme transport retries once, respects cancellation, and never retries rejected permissions',async()=>{
 for(const status of [401,403,422,500,502,503,504]){let calls=0;const signal=new AbortController().signal;
  await assert.rejects(themeRequest(async()=>{calls++;throw {response:{status}}},signal));
  assert.equal(calls,[502,503,504].includes(status)?2:1);
 }
 let calls=0;const abort=new AbortController();abort.abort();
 await assert.rejects(themeRequest(async()=>{calls++;throw Error('cancel')},abort.signal));assert.equal(calls,1);
});

const {leavesDocument}=load('../src/app/review/navigation-guard.ts');
test('unsaved notebook guard ignores pagination, downloads, hashes and new windows but protects actual navigation',()=>{
 const location='https://stock.example/review/?date=2026-10-13';
 const event={button:0};
 const anchor=(href,extra={})=>({getAttribute:()=>href,hasAttribute:name=>name==='download'&&!!extra.download,target:extra.target||''});
 for(const href of [null,'','#details','?date=2026-10-13#details','javascript:void(0)','mailto:owner@example.com']) assert.equal(leavesDocument(anchor(href),event,location),false);
 assert.equal(leavesDocument(anchor('/other/',{download:true}),event,location),false);
 assert.equal(leavesDocument(anchor('/other/',{target:'_blank'}),event,location),false);
 for(const key of ['ctrlKey','metaKey','shiftKey','altKey','defaultPrevented']) assert.equal(leavesDocument(anchor('/other/'),{...event,[key]:true},location),false);
 assert.equal(leavesDocument(anchor('/other/'),{button:1},location),false);
 for(const href of ['/analysis/overview/','?date=2026-10-12','https://external.example/review/']) assert.equal(leavesDocument(anchor(href),event,location),true);
});

test('image transport restores exact bytes, deduplicates assets and leaves the input untouched', async () => {
 const {loadNotebookImages}=load('../src/app/review/notebook-images.ts');
 const c=exp.emptyNotebook(); const token='review-asset:'+'a'.repeat(64);
 c.article={body:'# Test',feishuUrl:'',images:[{id:'a',data:token,caption:'A',source:'',after:''},{id:'b',data:token,caption:'B',source:'',after:''}]};
 let reads=0;
 const result=await loadNotebookImages(c,new AbortController().signal,async()=>{reads++;return png;});
 assert.equal(reads,1);assert.equal(result.article.images[0].data,png);assert.equal(result.article.images[1].data,png);assert.equal(c.article.images[0].data,token);
 assert.deepEqual(contract.validateArticle(result.article),result.article);
});
test('missing, invalid and canceled images never produce an editable partial notebook', async () => {
 const {loadNotebookImages}=load('../src/app/review/notebook-images.ts');
 const c=exp.emptyNotebook();c.article={body:'',feishuUrl:'',images:[{id:'a',data:'review-asset:'+'a'.repeat(64),caption:'',source:'',after:''}]};
 await assert.rejects(loadNotebookImages(c,new AbortController().signal,async()=>{throw Error('missing');}),/missing/);
 await assert.rejects(loadNotebookImages(c,new AbortController().signal,async()=>'https://external/image'));
 const abort=new AbortController();abort.abort();let reads=0;
 await assert.rejects(loadNotebookImages(c,abort.signal,async()=>{reads++;return png;}));assert.equal(reads,0);
});
