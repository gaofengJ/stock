import type { MarketSeries } from '@/api/market';

export const environmentRanges = [20, 60, 120, 250, 730].map((value) => ({ value, label: value === 730 ? '最近两年' : `近${value}个交易日` }));

export function relativeChange(value: number | null | undefined, base: number | null | undefined): number | null {
  if (value == null || base == null || !Number.isFinite(value) || !Number.isFinite(base) || base <= 0) return null;
  return (value / base - 1) * 100;
}

/** 所有指数使用同一个日历基准；缺失基准时不擅自顺延，以免比较不同区间。 */
export function indexComparison(indexes: MarketSeries['indexes'], dates: string[], count: number) {
  const visibleDates = count === 730 ? dates : dates.slice(-(count + 1));
  const baseline = visibleDates[0];
  const end = visibleDates.at(-1);
  return {
    dates: visibleDates,
    baseline,
    end,
    indexes: indexes.map((index) => {
      const prices = new Map(index.series.filter((r) => Number.isFinite(r.close) && r.close > 0).map((r) => [r.date, r.close]));
      const base = prices.get(baseline);
      const final = prices.get(end || '');
      return {
        code: index.code,
        name: index.name,
        values: visibleDates.map((date) => relativeChange(prices.get(date), base)),
        change: relativeChange(final, base),
        returns: [5, 20, 60].map((days) => relativeChange(final, prices.get(dates[dates.length - days - 1]))),
      };
    }),
  };
}

export function breadthDelta(series: { date: string; data: { ma20: { ratio: number | null }; ma60: { ratio: number | null } } | null }[], key: 'ma20' | 'ma60'): number | null {
  const current = series.at(-1)?.data?.[key].ratio;
  const previous = series.at(-2)?.data?.[key].ratio;
  return current == null || previous == null ? null : current - previous;
}
