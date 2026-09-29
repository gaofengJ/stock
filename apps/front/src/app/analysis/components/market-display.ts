import type { IndexPoint, MarketScope, MarketSeries } from '@/api/market';

export const scopes = [
  { value: 'all', label: '沪深京全部', description: '上海、深圳和北京交易所的全部A股，包含主板、创业板和科创板。' },
  { value: 'hs', label: '沪深', description: '上海和深圳交易所的A股，包含沪深主板、创业板和科创板，不含北交所。' },
  { value: 'main', label: '主板', description: '仅沪深主板A股，不含创业板、科创板和北交所。上证指数、深证成指作为市场参考，不代表纯主板样本。' },
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
export interface Candle {
  date: string; start: string; end: string; value: [number, number, number, number] | null;
}
// Use the trading calendar to retain gaps. A missing trading day invalidates its candle.
export function indexCandles(points: IndexPoint[], dates: string[], period: CandlePeriod): Candle[] {
  const byDate = new Map(points.map((p) => [p.date, p]));
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
  return Array.from(groups.values()).map((days): Candle => {
    const rows = days.map((d) => byDate.get(d));
    const valid = rows.every((p) => p && [p.open, p.close, p.low, p.high].every((v) => typeof v === 'number' && Number.isFinite(v)));
    return {
      date: days[days.length - 1],
      start: days[0],
      end: days[days.length - 1],
      value: valid ? [rows[0]!.open!, rows[rows.length - 1]!.close, Math.min(...rows.map((p) => p!.low!)), Math.max(...rows.map((p) => p!.high!))] : null,
    };
  });
}
