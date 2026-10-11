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
test('template covers research, plan validation, execution and separate public writing',()=>{
 const t=exp.templateText();for(const s of ['市场与主线','今日操作','明日计划','一条总结','买入触发','放弃条件','公开笔记'])assert.ok(t.includes(s));
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
 const text=research.researchDraft(r);assert.ok(text.includes('缺失')&&text.includes('涨停 3 家'));
 assert.deepEqual(contract.validateResearch(r),serverContract.validateResearch(r));
});
