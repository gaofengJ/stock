const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const exportsObject = {};
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/analysis/chains/chains-display.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
new Function('exports', code)(exportsObject);
const { chainView, filterTrajectories } = exportsObject;

test('all three tabs survive URL restoration; invalid views fall back to the first tab', () => {
  for (const view of ['ladder', 'trajectory', 'history']) assert.equal(chainView(view), view);
  for (const view of [null, '', 'unknown']) assert.equal(chainView(view), 'ladder');
});
test('state filters use the selected day, keep missing separate from zero, and accept lowercase stock codes', () => {
  const rows = [
    { tsCode: '000001.SZ', name: '甲', cells: [{date:'2026-09-29',height:3,state:'3板'}, {date:'2026-09-30',height:0,state:'断板'}] },
    { tsCode: '600001.SH', name: '乙', cells: [{date:'2026-09-30',height:2,state:'2板'}] },
    { tsCode: '600002.SH', name: '丙', cells: [{date:'2026-09-30',height:null,state:'无行情'}] },
    { tsCode: '600003.SH', name: '丁', cells: [{date:'2026-09-30',height:0,state:'交易'}] },
  ];
  const codes = (day, keyword, state) => filterTrajectories(rows, day, keyword, state).map(r=>r.tsCode);
  assert.deepEqual(codes('2026-09-30', '', '连板'), ['600001.SH']);
  assert.deepEqual(codes('2026-09-30', '', '断板'), ['000001.SZ']);
  assert.deepEqual(codes('2026-09-30', '', '待补齐'), ['600002.SH']);
  assert.deepEqual(codes('2026-09-30', '', '交易'), ['600003.SH']);
  assert.deepEqual(codes('2026-09-30', ' 000001.sz ', 'all'), ['000001.SZ']);
  assert.deepEqual(codes('2026-09-29', '', '连板'), ['000001.SZ']);
});
