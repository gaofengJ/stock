const test=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const exp={};new Function('exports',ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/app/review/notebook-model.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exp);
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
 const server = {};
 const source = fs.readFileSync(path.join(__dirname, '../../back/src/modules/review/notebook.content.ts'), 'utf8');
 new Function('exports', 'require', ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(server, () => ({BadRequestException: Error}));
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
