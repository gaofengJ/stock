import type { DailyEntity } from '../source/daily/daily.entity';
import type { TrendFactor } from './trend.entity';

/** Only an authoritative unit factor on the listing day proves raw = HFQ. */
export function listingDayFactor(
  date: string,
  listingDate: string,
  quote: Pick<DailyEntity, 'tsCode' | 'open' | 'close' | 'high' | 'low'>,
  response: any,
): TrendFactor | undefined {
  if (listingDate !== date || response?.code !== 0) return undefined;
  const { fields, items } = response.data || {};
  if (
    !Array.isArray(fields) ||
    !Array.isArray(items) ||
    items.length !== 1 ||
    !['ts_code', 'trade_date', 'adj_factor'].every((key) =>
      fields.includes(key),
    ) ||
    !Array.isArray(items[0]) ||
    items[0].length !== fields.length
  )
    return undefined;
  const row = Object.fromEntries(fields.map((key, i) => [key, items[0][i]]));
  if (
    row.ts_code !== quote.tsCode ||
    row.trade_date !== date.replace(/-/g, '') ||
    Number(row.adj_factor) !== 1
  )
    return undefined;
  const prices = [quote.open, quote.close, quote.high, quote.low].map(Number);
  if (
    prices.some((p) => !Number.isFinite(p) || p <= 0) ||
    prices[2] < Math.max(prices[0], prices[1]) ||
    prices[3] > Math.min(prices[0], prices[1])
  )
    return undefined;
  return [quote.tsCode, prices[0], prices[1], prices[2], prices[3]];
}
