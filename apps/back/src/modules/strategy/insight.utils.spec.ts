import {
  hotChanges,
  observationReturn,
  rankInsights,
  stockInsight,
  summarizeReturns,
} from './insight.utils';
import { StockInsight, HotStock } from './insight.entity';
import { TrendPoint } from './trend-rules';

const dates = Array.from({ length: 61 }, (_, i) => String(i).padStart(3, '0'));
function points(closes = dates.map((_, i) => i + 10)) {
  return new Map(
    dates.map((d, i) => [
      d,
      {
        date: d,
        close: closes[i],
        open: closes[i],
        high: closes[i],
        low: closes[i],
        basis: '000001.SZ',
      } as TrendPoint,
    ]),
  );
}
const insight = (change: number, code = '000001.SZ'): StockInsight => ({
  code,
  name: code,
  close: 100,
  basis: code,
  traded: true,
  periods: { 20: { change, rps: null, high: true, low: false }, 60: null },
});
const hot = (code: string, rank: number): HotStock => ({
  code,
  name: code,
  rank,
  hot: 1,
  time: '22:30:00',
});

describe('Market insight statistics', () => {
  it('compares the current adjusted close to all prior N closes, excluding today', () => {
    const result = stockInsight('000001.SZ', '', dates, points(), true);
    expect(result.periods[20]).toMatchObject({
      high: true,
      low: false,
      change: 40,
    });
    expect(result.periods[60]?.change).toBe(600);
    const tied = points();
    tied.get('060')!.close = 69;
    expect(
      stockInsight('000001.SZ', '', dates, tied, true).periods[20]?.high,
    ).toBe(false);
    tied.get('060')!.close = 9;
    expect(
      stockInsight('000001.SZ', '', dates, tied, true).periods[60]?.low,
    ).toBe(true);
  });
  it('does not substitute zero for missing history or suspended trading', () => {
    const missing = points();
    missing.delete('010');
    const result = stockInsight('000001.SZ', '', dates, missing, true);
    expect(result.periods[60]).toBeNull();
    expect(result.periods[20]).not.toBeNull();
    expect(
      stockInsight('000001.SZ', '', dates, points(), false).periods[20],
    ).toBeNull();
    expect(
      stockInsight('000001.SZ', '', dates.slice(-20), points(), true)
        .periods[20],
    ).toBeNull();
  });
  it('requires a common adjusted-price basis across a code change', () => {
    const values = points();
    values.get('060')!.basis = '920001.BJ';
    expect(
      stockInsight('920001.BJ', '', dates, values, true).periods[20],
    ).toBeNull();
    values.get('060')!.conversion = 2;
    expect(
      stockInsight('920001.BJ', '', dates, values, true).periods[20]?.low,
    ).toBe(true);
  });
  it('gives tied returns the same percentile and scopes the denominator', () => {
    const rows = [
      insight(-10),
      insight(0, '600000.SH'),
      insight(0, '300001.SZ'),
      insight(20, '920001.BJ'),
    ];
    const summaries = rankInsights(rows);
    expect(rows.map((r) => r.periods[20]?.rps)).toEqual([0, 50, 50, 100]);
    expect(summaries.bj[20]).toMatchObject({
      eligible: 1,
      high: 1,
      highRatio: 100,
    });
    expect(summaries.all[60]).toMatchObject({ eligible: 0, highRatio: null });
  });
  it('observes valid zero returns and excludes missing or suspended endpoints', () => {
    expect(observationReturn(insight(1), insight(2))).toBe(0);
    expect(observationReturn(insight(1), { ...insight(2), close: 110 })).toBe(
      10,
    );
    expect(
      observationReturn(insight(1), { ...insight(2), traded: false }),
    ).toBeNull();
    expect(observationReturn(insight(1), undefined)).toBeNull();
    expect(
      observationReturn(
        { ...insight(0, '920001.BJ'), basis: '830001.BJ' },
        { ...insight(0, '920001.BJ'), close: 220, conversion: 2 },
      ),
    ).toBe(10);
    expect(summarizeReturns([0, 10, -10])).toEqual({
      sample: 3,
      average: 0,
      median: 0,
      riseRate: 33.3333,
    });
    expect(summarizeReturns([]).average).toBeNull();
  });
  it('does not label an unknown prior rank as a new entry', () => {
    expect(hotChanges([hot('a', 1)], null)[0].state).toBe('unknown');
    expect(hotChanges([hot('a', 1)], [], false)[0].state).toBe('unknown');
    expect(hotChanges([hot('a', 1)], [hot('a', 20)], false)[0].change).toBe(19);
    expect(hotChanges([hot('a', 1)], [hot('b', 1)])[0].state).toBe('new');
  });
});
