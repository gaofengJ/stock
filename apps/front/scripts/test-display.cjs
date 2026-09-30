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
const funds = load('utils/active-funds.ts');
const navigation = load('app/analysis/components/market-navigation.ts');
const promotion = load('app/analysis/components/promotion-display.ts', {'@/utils/format': format});

test('promotion tooltip distinguishes no cohort, failed promotion, valid rate and missing data', () => {
  const stats = (rate, numerator, denominator, from = 3) => ({upgrades: [{from, rate, numerator, denominator}]});
  assert.equal(promotion.promotionTooltip(stats(null, 0, 0), 3), '昨日三板样本为 0，暂无晋级率');
  assert.equal(promotion.promotionTooltip(stats(0, 0, 4), 3), '0.00%（晋级 0 只／昨日样本 4 只）');
  assert.equal(promotion.promotionTooltip(stats(50, 2, 4), 3), '50.00%（晋级 2 只／昨日样本 4 只）');
  assert.equal(promotion.promotionTooltip(null, 3), '当日统计数据缺失');
  assert.equal(promotion.promotionTooltip(stats(null, 0, 4), 3), '晋级率数据缺失（晋级 0 只／昨日样本 4 只）');
  assert.equal(promotion.promotionTooltip(stats(null, 0, 0, 4), 4), '昨日四板及以上样本为 0，暂无晋级率');
});

test('seat association matches typography variants but never another branch', () => {
  const rows = [
    {name:'甲', orgs:['高盛（中国）证券有限公司上海世纪大道证券营业部']},
    {name:'乙', orgs:['高盛(中国)证券有限公司上海世纪大道证券营业部']},
    {name:'丙', orgs:['高盛(中国)证券有限公司上海南京路证券营业部']},
  ];
  assert.deepEqual(funds.matchingFunds(rows, ' 高盛(中国)证券有限公司 上海世纪大道证券营业部 ').map(r=>r.name), ['甲','乙']);
  assert.deepEqual(funds.matchingFunds(rows, '机构专用'), []);
  assert.deepEqual(funds.matchingFunds(rows, ''), []);
  assert.equal(new URL(funds.activeFundsHref('席位 & 名称'), 'https://example.test').searchParams.get('org'), '席位 & 名称');
});
test('only explicit market detail links carry validated date and scope', () => {
  const href = navigation.marketHref('/analysis/limits', {date:'2026-09-28',scope:'gem'}, {keyword:'300001.SZ'});
  const params = new URL(href, 'https://example.test').searchParams;
  assert.equal(params.get('keyword'), '300001.SZ');
  assert.deepEqual(navigation.linkedSelection(params.toString()), {date:'2026-09-28',scope:'gem'});
  assert.deepEqual(navigation.linkedSelection('scope=invalid&date=hello'), {});
  assert.deepEqual(navigation.linkedSelection(''), {});
});

const candle = (date, low, high, close = high) => ({ date, start: date, end: date, value: [low, close, low, high] });
test('index volume and market amount share candle dates and sum complete calendar periods', () => {
  const dates = ['2025-12-29', '2025-12-31', '2026-01-02', '2026-01-05'];
  const points = dates.map((date, i) => ({date, open: 100 + i, close: 101 + i, low: 99 + i, high: 102 + i, vol: (i + 1) * 10000}));
  const amounts = dates.map((date, i) => ({date, value: (i + 1) * 100}));
  for (const period of ['day', 'week', 'month']) {
    const candles = market.indexCandles(points, dates, period);
    const totals = market.periodTotals(amounts, dates, period);
    assert.deepEqual(candles.map(c => [c.start, c.end, c.date]), totals.map(c => [c.start, c.end, c.date]));
  }
  assert.deepEqual(market.indexCandles(points, dates, 'week').map(c => c.volume), [6, 4]);
  assert.deepEqual(market.indexCandles(points, dates, 'month').map(c => c.volume), [3, 7]);
  assert.deepEqual(market.periodTotals(amounts, dates, 'week').map(c => c.value), [600, 400]);
  assert.deepEqual(market.periodTotals(amounts, dates, 'month').map(c => c.value), [300, 700]);
});

test('missing or invalid volume leaves a gap independently of valid prices, while zero is retained', () => {
  const dates = ['2026-09-21', '2026-09-22'];
  const points = dates.map(date => ({date, open: 100, close: 101, low: 99, high: 102, vol: 0}));
  assert.equal(market.indexCandles(points, dates, 'week')[0].volume, 0);
  for (const invalid of [undefined, null, NaN, -1]) {
    const candles = market.indexCandles([points[0], {...points[1], vol: invalid}], dates, 'week');
    assert.equal(candles[0].volume, null);
    assert.deepEqual(candles[0].value, [100, 101, 99, 102]);
    assert.equal(market.periodTotals([{date: dates[0], value: 100}, {date: dates[1], value: invalid}], dates, 'month')[0].value, null);
  }
  assert.equal(market.periodTotals([{date: dates[0], value: 100}], dates, 'week')[0].value, null);
});

test('paired index charts keep matching gaps and retain valid zero volume in every period', () => {
  const dates = ['2026-09-21', '2026-09-22'];
  const points = dates.map(date => ({date, open: 100, close: 101, low: 99, high: 102, vol: 0}));
  for (const period of ['day', 'week', 'month']) {
    const valid = market.pairedIndexCandles(points, dates, period);
    assert.ok(valid.every(c => c.value && c.volume === 0));
    for (const invalid of [{...points[1], vol: undefined}, {...points[1], high: undefined}]) {
      const rows = market.pairedIndexCandles([points[0], invalid], dates, period);
      assert.equal(rows.at(-1).value, null);
      assert.equal(rows.at(-1).volume, null);
      if (period === 'day') assert.deepEqual(rows[0].value, [100, 101, 99, 102]);
    }
  }
});

test('moving averages use full history before clipping and restart after missing candles', () => {
  const candles = Array.from({ length: 300 }, (_, i) => candle(String(i), i + 1, i + 1));
  const ma = market.movingAverage(candles, 250);
  assert.equal(ma[248], null);
  assert.equal(ma[249], 125.5);
  assert.equal(ma.at(-1), 175.5);
  const missing = [...candles.slice(0, 5), { value: null }, ...candles.slice(6, 12)];
  assert.deepEqual(market.movingAverage(missing, 5).slice(4, 11), [3, null, null, null, null, null, 9]);
});

test('gap bands shrink on partial fills and disappear on full fills without treating missing days as gaps', () => {
  const up = [candle('1', 90, 100), candle('2', 105, 110), candle('3', 103, 108)];
  assert.deepEqual(market.unfilledGaps(up), [{ start: '1', low: 100, high: 103, direction: 'up' }]);
  assert.deepEqual(market.unfilledGaps([...up, candle('4', 99, 106)]), []);
  const down = [candle('1', 100, 110), candle('2', 90, 95), candle('3', 91, 98)];
  assert.deepEqual(market.unfilledGaps(down), [{ start: '1', low: 98, high: 100, direction: 'down' }]);
  assert.deepEqual(market.unfilledGaps([...down, candle('4', 92, 101)]), []);
  assert.deepEqual(market.unfilledGaps([up[0], { value: null }, up[1]]), []);
});

test('trillion reference lines convert from hundred-million units and leave small charts unscaled', () => {
  assert.deepEqual(market.amountReferenceLevels([null, 400, 9000]), []);
  assert.deepEqual(market.amountReferenceLevels([10000]), [10000]);
  assert.deepEqual(market.amountReferenceLevels([16800]), [10000, 20000]);
  assert.deepEqual(market.amountReferenceLevels([25000, NaN]), [10000, 20000, 30000]);
  assert.deepEqual(market.amountReferenceLevels([520000]), [100000, 200000, 300000, 400000, 500000, 600000]);
});

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
