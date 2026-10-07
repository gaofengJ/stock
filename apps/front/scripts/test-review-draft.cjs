const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, imports = {}, storage) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/review', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', 'localStorage', code)((name) => imports[name] || require(name), exports, storage);
  return exports;
}
const draft = load('review-draft.ts');
const { reviewMarkdown } = load('review-document.ts');

test('export retains the preview snapshot, multiline notes and optional holdings without changing it', () => {
  const snapshot = {
    title: '2026-09-30 每日复盘', filename: '每日复盘-2026-09-30.md', metadata: ['计划生成时间：2026-10-08 08:30:00'],
    sections: [
      { title: '观察名单', items: [{ title: '测试股票 000001.SZ', fields: [{ label: '观察条件', text: '第一行\n第二行 <script>仍作为文本</script>' }, { label: '风险核验', text: '资料待核验' }] }] },
      { title: '下一交易日计划', fields: [{ label: '重点观察', text: '市场量能' }] },
      { title: '本次持仓分析', paragraphs: ['模拟分析'], items: [{ title: '持仓股票 000002.SZ', fields: [{ label: '成本价格差', text: '0.00%' }] }] },
    ],
  };
  const original = structuredClone(snapshot);
  const markdown = reviewMarkdown(snapshot);
  for (const text of ['第一行\n第二行 <script>仍作为文本</script>', '风险核验：资料待核验', '重点观察：市场量能', '成本价格差：0.00%', snapshot.metadata[0]]) assert(markdown.includes(text));
  assert.deepEqual(snapshot, original);
  assert.equal(reviewMarkdown(snapshot), markdown);
});

test('an empty watchlist still exports the general plan and missing-data explanations', () => {
  const markdown = reviewMarkdown({title:'复盘',filename:'复盘.md',metadata:[],sections:[
    {title:'观察名单',paragraphs:['本次未选观察股票。'],items:[]},
    {title:'下一交易日计划',fields:[{label:'重点观察',text:'待填写'}]},
    {title:'数据说明',paragraphs:['候选资料尚未取得。']},
  ]});
  assert(markdown.includes('本次未选观察股票。'));
  assert(markdown.includes('重点观察：待填写'));
  assert(markdown.includes('候选资料尚未取得。'));
  assert(!markdown.includes('本次持仓分析'));
});
const pick = (n) => ({ tsCode: `${String(n).padStart(6, '0')}.SZ`, name: `股票${n}` });

function mount(storage, account = 1, date = '2026-09-30') {
  const slots = []; let index = 0; let effect;
  const react = {
    useRef(value) { const i = index++; slots[i] ??= { current: value }; return slots[i]; },
    useState(value) {
      const i = index++;
      if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }];
    },
    useEffect(callback) { effect ??= callback; },
  };
  const hook = load('useReviewDraft.ts', { react, './review-draft': draft }, storage).default;
  const render = () => { index = 0; return hook(account, date); };
  render(); effect();
  return render;
}

test('draft keys separate accounts and trading dates', () => {
  assert.notEqual(draft.draftKey(1, '2026-09-30'), draft.draftKey(2, '2026-09-30'));
  assert.notEqual(draft.draftKey(1, '2026-09-30'), draft.draftKey(1, '2026-09-29'));
});
test('parsing preserves valid notes, deduplicates picks, rejects invalid codes and caps at three', () => {
  const value = draft.parseDraft(JSON.stringify({ selected: [pick(1), pick(1), null, { tsCode: 'invalid' }, pick(2), pick(3), pick(4)], focus: '市场观察', notes: { '000001.SZ': '观察条件', invalid: '无效' }, riskNotes: { '000001.SZ': '公告核验记录' } }));
  assert.deepEqual(value.selected, [pick(1), pick(2), pick(3)]);
  assert.deepEqual(value.notes, { '000001.SZ': '观察条件' });
  assert.equal(value.riskNotes['000001.SZ'], '公告核验记录');
  assert.equal(value.focus, '市场观察');
});
test('missing drafts use defaults, corrupt drafts fail explicitly, long notes are bounded', () => {
  assert.deepEqual(draft.parseDraft(null), draft.emptyDraft());
  for (const raw of ['{', 'null', '[]']) assert.throws(() => draft.parseDraft(raw));
  assert.equal(draft.parseDraft(JSON.stringify({ focus: 'x'.repeat(2100) })).focus.length, 2000);
});
test('restoring does not overwrite storage; edits persist immediately and survive remount', () => {
  const memory = new Map([[draft.draftKey(1, '2026-09-30'), JSON.stringify({ selected: [pick(1)], focus: '原计划' })]]);
  let writes = 0;
  const storage = { getItem: (key) => memory.get(key), setItem: (key, value) => { writes++; memory.set(key, value); } };
  const render = mount(storage);
  assert.equal(writes, 0);
  assert.equal(render().draft.focus, '原计划');
  render().update({ focus: '更新计划' }); render().update({ exit: '退出条件' });
  const restored = mount(storage)();
  assert.equal(restored.draft.focus, '更新计划');
  assert.equal(restored.draft.exit, '退出条件');
  assert.deepEqual(restored.draft.selected, [pick(1)]);
  assert.equal(writes, 2);
});
test('different account or date never restores another draft', () => {
  const storage = { getItem: (key) => key === draft.draftKey(1, '2026-09-30') ? JSON.stringify({ focus: '私人草稿' }) : null, setItem() {} };
  assert.equal(mount(storage, 1, '2026-09-29')().draft.focus, '');
  assert.equal(mount(storage, 2, '2026-09-30')().draft.focus, '');
});
test('storage failures retain current edits and display an export reminder', () => {
  const render = mount({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } });
  assert.match(render().status, /读取失败/);
  render().update({ focus: '仍保留的计划' });
  assert.equal(render().draft.focus, '仍保留的计划');
  assert.match(render().status, /保存失败/);
});

const interactions = load('review-interactions.ts');
test('holdings validation marks both duplicate rows and rejects future dates and invalid costs', () => {
  const errors = interactions.holdingErrors([{id:0,code:'000001.SZ',boughtOn:'2026-10-01',cost:0},{id:1,code:'000001.SZ',cost:NaN}], '2026-09-30');
  assert.ok(errors.every(e=>e.code)); assert.ok(errors[0].boughtOn); assert.ok(errors.every(e=>e.cost));
  assert.deepEqual(interactions.holdingErrors([{id:0,code:'920001.BJ',boughtOn:'2026-09-30',cost:1}], '2026-09-30'), [{code:'',boughtOn:'',cost:''}]);
});
test('calendar dates reject overflow and cap sorting handles two missing values', () => {
  assert.equal(interactions.validDate('2026-02-30'),false);
  assert.equal(interactions.validDate('2026-09-29'),true);
  assert.equal(interactions.validDate('invalid'),false);
  assert.equal(interactions.compareCap(null,undefined),0);
  assert.equal(interactions.compareCap(null,1),1);
  assert.equal(interactions.compareCap(1,null),-1);
  assert.equal(interactions.compareCap(10,20),-10);
});
