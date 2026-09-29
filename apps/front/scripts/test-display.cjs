const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function('require', 'exports', code)((name) => imports[name] || require(name), exports);
  return exports;
}
const format = load('utils/format.ts');
const avatars = load('auth/avatars.ts');
const market = load('app/analysis/components/market-display.ts');

test('market scope selects relevant reference indexes without leaking Shanghai into Beijing', () => {
  const indexes = ['000001.SH', '399001.SZ', '399006.SZ', '000688.SH', '899050.BJ', '000300.SH'].map(code => ({code}));
  assert.deepEqual(market.scopeIndexes(indexes, 'bj').map(x => x.code), ['899050.BJ']);
  assert.deepEqual(market.scopeIndexes(indexes, 'gem').map(x => x.code), ['399006.SZ']);
  assert.deepEqual(market.scopeIndexes(indexes, 'star').map(x => x.code), ['000688.SH']);
  assert.deepEqual(market.scopeIndexes(indexes, 'main').map(x => x.code), ['000001.SH', '399001.SZ']);
  assert.equal(market.scopeIndexes(indexes, 'hs').length, 5);
  assert.equal(market.scopeIndexes(indexes, 'all').length, 6);
});

test('weekly and monthly candles use first open, last close and actual high/low, across year boundaries', () => {
  const points = [
    {date:'2025-12-29',open:100,close:103,low:98,high:105},
    {date:'2025-12-31',open:103,close:102,low:101,high:110},
    {date:'2026-01-02',open:102,close:107,low:100,high:108},
    {date:'2026-01-05',open:107,close:106,low:104,high:109},
  ];
  const dates = points.map(x => x.date);
  assert.deepEqual(market.indexCandles(points, dates, 'day').map(x=>x.value), points.map(p=>[p.open,p.close,p.low,p.high]));
  assert.deepEqual(market.indexCandles(points, dates, 'week').map(x=>x.value), [[100,107,98,110],[107,106,104,109]]);
  assert.deepEqual(market.indexCandles(points, dates, 'month').map(x=>x.value), [[100,102,98,110],[102,106,100,109]]);
  assert.equal(points[0].open,100);
});

test('missing daily data leaves a gap instead of fabricating weekly or monthly candles', () => {
  const points=[{date:'2026-09-21',open:100,close:101,low:99,high:102}];
  const dates=['2026-09-21','2026-09-22'];
  assert.equal(market.indexCandles(points, dates, 'day')[1].value,null);
  assert.equal(market.indexCandles(points, dates, 'week')[0].value,null);
  assert.equal(market.indexCandles(points, dates, 'month')[0].value,null);
  assert.equal(market.indexCandles([{...points[0],high:NaN}], dates.slice(0,1), 'day')[0].value,null);
  assert.deepEqual(market.indexCandles([], [], 'month'),[]);
});
test('all users share 28 choices and explicit choices override role defaults', () => {
  const admin = [{ code: 'admin' }];
  assert.equal(avatars.avatarId('bull-admin-heart', admin), 'bull-red-heart');
  assert.equal(avatars.avatarId('animal-5', admin), 'bull-red-star');
  assert.equal(avatars.avatarId('animal-5', [{ code: 'user' }]), 'animal-5');
  assert.equal(avatars.avatarId('bull-admin-heart', [{ code: 'user' }]), 'bull-red-heart');
  assert.equal(avatars.avatarId('../invalid'), 'bull-pink-star');
  assert.equal(avatars.avatarId('auto-bull-blue-flower', admin), 'bull-red-star');
  assert.equal(avatars.avatarId('auto-bull-blue-flower', []), 'bull-blue-flower');
  assert.equal(avatars.avatarId(undefined, admin), 'bull-red-star');
  assert.equal(avatars.avatarOptions().length, 28);
  for (const option of avatars.avatarOptions()) {
    assert.equal(avatars.avatarId(option.id, admin), option.id);
    assert.equal(avatars.avatarId(option.id, []), option.id);
    assert.ok(fs.existsSync(path.join(__dirname, '../public/avatars', `${option.id}.svg`)));
  }
  for (const color of avatars.avatarColors) assert.equal(avatars.avatarOptions().filter(x => x.color === color.id).length, 4);
});
test('missing and non-finite values remain distinct from real zero', () => {
  for (const value of [null, undefined, '', ' ', NaN, Infinity, -Infinity, true, {}, 'unknown']) assert.equal(format.numberText(value), '—');
  assert.equal(format.numberText(0), '0.00');
  assert.equal(format.numberText('0'), '0.00');
});
test('precision, grouping, signs and negative zero are consistent', () => {
  assert.equal(format.numberText(16685.034529), '16,685.03');
  assert.equal(format.numberText(-0.00004, 2, true), '0.00');
  assert.equal(format.numberText(1.237, 2, true), '+1.24');
  assert.equal(format.numberText(-1.237, 2, true), '-1.24');
  assert.equal(format.numberText(4306, 0), '4,306');
  assert.equal(format.numberText(1.005), '1.01');
  assert.equal(format.numberText(-1.005), '-1.01');
  assert.equal(format.changeClass(-0.00004), 'quote-flat');
});
test('each source amount is converted once and preserves missing values', () => {
  assert.equal(format.scaledNumber(1234567, 10), '123,456.70'); // 千元 -> 万元
  assert.equal(format.scaledNumber(1234567, 100000), '12.35'); // 千元 -> 亿元
  assert.equal(format.scaledNumber(1234567, 10000), '123.46'); // 万元 -> 亿元
  assert.equal(format.scaledNumber(1234567890, 100000000), '12.35'); // 元 -> 亿元
  for (const value of [null, undefined, '']) assert.equal(format.scaledNumber(value, 10000), '—');
});
test('historical update times use Beijing timezone including year boundaries', () => {
  assert.equal(format.beijingTime('2024-12-31T17:02:00.000Z'), '2025-01-01 01:02');
  assert.equal(format.beijingTime('invalid'), '—');
});
const dates = load('hooks/useDefaultTradeDate.ts', { '@/api/services': {}, '@/api/errors': {} });
test('default trade date switches at 20:30 Beijing regardless of system timezone', () => {
  assert.equal(dates.getCandidateDate(new Date('2026-09-24T12:29:59Z')).format('YYYY-MM-DD'), '2026-09-23');
  assert.equal(dates.getCandidateDate(new Date('2026-09-24T12:30:00Z')).format('YYYY-MM-DD'), '2026-09-24');
  assert.equal(dates.getCandidateDate(new Date('2025-01-01T00:00:00Z')).format('YYYY-MM-DD'), '2024-12-31');
});
