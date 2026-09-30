import type { IndexPoint, MarketScope, MarketSeries } from '@/api/market';

export const scopes = [
  { value: 'all', label: '沪深京全部', description: '上海、深圳、北京交易所的全部A股。' },
  { value: 'hs', label: '沪深', description: '沪深A股，含主板、创业板、科创板，不含北交所。' },
  { value: 'main', label: '主板', description: '仅沪深主板A股；参考指数的样本并非纯主板。' },
  { value: 'gem', label: '创业板', description: '深圳交易所创业板A股，以创业板指作为参考指数。' },
  { value: 'star', label: '科创板', description: '上海交易所科创板A股，以科创50作为参考指数。' },
  { value: 'bj', label: '北交所', description: '北京证券交易所A股，以北证50作为参考指数。' },
];

export function scopeIndexes(indexes: MarketSeries['indexes'], scope: MarketScope) {
  const codes: Partial<Record<MarketScope, string[]>> = {
    main: ['000001.SH', '399001.SZ'], gem: ['399006.SZ'], star: ['000688.SH'], bj: ['899050.BJ'],
  };
  return indexes.filter((i) => (codes[scope] ? codes[scope]!.includes(i.code) : scope !== 'hs' || !i.code.endsWith('.BJ')));
}

export type CandlePeriod = 'day' | 'week' | 'month';
export interface ChartWindow { period: CandlePeriod; count: number }
export const defaultChartCounts = { day: 60, week: 26, month: 12 };
export const chartRanges = { day: [20, 60, 120, 250, 0], week: [12, 26, 52, 0], month: [6, 12, 24, 0] };
export interface Candle {
  date: string; start: string; end: string; value: [number, number, number, number] | null;
}
export const averagePeriods = [5, 10, 20, 30, 60, 120, 250];

export function movingAverage(candles: Candle[], period: number): (number | null)[] {
  let sum = 0;
  let consecutive = 0;
  return candles.map((c, i) => {
    if (!c.value) { sum = 0; consecutive = 0; return null; }
    sum += c.value[1]; consecutive += 1;
    if (consecutive > period) sum -= candles[i - period].value![1];
    return consecutive >= period ? sum / period : null;
  });
}

export interface PriceGap { start: string; low: number; high: number; direction: 'up' | 'down' }
export function unfilledGaps(candles: Candle[]): PriceGap[] {
  let gaps: PriceGap[] = [];
  candles.forEach((c, i) => {
    if (!c.value) { gaps = []; return; }
    const [, , low, high] = c.value;
    gaps = gaps.flatMap((gap) => {
      if (gap.direction === 'up') return low <= gap.low ? [] : [{ ...gap, high: Math.min(gap.high, low) }];
      return high >= gap.high ? [] : [{ ...gap, low: Math.max(gap.low, high) }];
    });
    const previous = candles[i - 1];
    if (!previous?.value) return;
    if (low > previous.value[3]) {
      gaps.push({
        start: previous.date, low: previous.value[3], high: low, direction: 'up',
      });
    }
    if (high < previous.value[2]) {
      gaps.push({
        start: previous.date, low: high, high: previous.value[2], direction: 'down',
      });
    }
  });
  return gaps;
}

// Amounts are in 亿元: 10,000 亿元 = 1 万亿元. Do not stretch small-volume charts to a trillion.
export function amountReferenceLevels(values: (number | null)[]): number[] {
  const max = Math.max(0, ...values.filter((v): v is number => v != null && Number.isFinite(v)));
  if (max < 10000) return [];
  // Weekly/monthly sums can reach tens of trillions; keep reference labels readable.
  const rawStep = Math.max(1, max / 10000 / 6);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 5, 10].find((n) => n * magnitude >= rawStep)! * magnitude * 10000;
  return Array.from({ length: Math.ceil(max / step) }, (_, i) => (i + 1) * step);
}
// Use the trading calendar to retain gaps. A missing trading day invalidates its candle.
export function periodGroups(dates: string[], period: CandlePeriod): string[][] {
  const groups = new Map<string, string[]>();
  dates.forEach((date) => {
    let key = date;
    if (period === 'month') key = date.slice(0, 7);
    if (period === 'week') {
      const monday = new Date(`${date}T00:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
      [key] = monday.toISOString().split('T');
    }
    groups.set(key, [...(groups.get(key) || []), date]);
  });
  return Array.from(groups.values());
}

export function periodTotals(points: { date: string; value: number | null | undefined }[], dates: string[], period: CandlePeriod) {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  return periodGroups(dates, period).map((days) => {
    const values = days.map((d) => byDate.get(d));
    const complete = values.every((v): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0);
    return {
      date: days.at(-1)!, start: days[0], end: days.at(-1)!, value: complete ? values.reduce((sum, v) => sum + v, 0) : null,
    };
  });
}

export function indexCandles(points: IndexPoint[], dates: string[], period: CandlePeriod): (Candle & { volume: number | null })[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
  const volumes = periodTotals(points.map((p) => ({ date: p.date, value: p.vol })), dates, period);
  return periodGroups(dates, period).map((days, i): Candle & { volume: number | null } => {
    const rows = days.map((d) => byDate.get(d));
    const valid = rows.every((p) => p && [p.open, p.close, p.low, p.high].every((v) => typeof v === 'number' && Number.isFinite(v)));
    return {
      date: days[days.length - 1],
      start: days[0],
      end: days[days.length - 1],
      value: valid ? [rows[0]!.open!, rows[rows.length - 1]!.close, Math.min(...rows.map((p) => p!.low!)), Math.max(...rows.map((p) => p!.high!))] : null,
      // index_daily vol is in hands; display 万手. Missing volume is not zero.
      volume: volumes[i].value == null ? null : volumes[i].value! / 10000,
    };
  });
}

/** A price/volume pair shares dates and gaps; a real zero volume remains valid. */
export function pairedIndexCandles(points: IndexPoint[], dates: string[], period: CandlePeriod) {
  return indexCandles(points, dates, period).map((c) => (
    c.value && c.volume != null ? c : { ...c, value: null, volume: null }
  ));
}

export function seriesAverage(values: (number | null | undefined)[]) {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}
