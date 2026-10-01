import { inScope, MarketScope } from './market.constants';

export interface BreadthMeasure {
  above: number;
  eligible: number;
  insufficient: number;
  missing: number;
  ratio: number | null;
}
export interface MarketBreadth {
  total: number;
  ma20: BreadthMeasure;
  ma60: BreadthMeasure;
}
export interface BreadthFactor {
  tsCode: string;
  closeHfq: unknown;
  maHfq20: unknown;
  maHfq60: unknown;
}

const positive = (value: unknown) =>
  (typeof value === 'number' || typeof value === 'string') &&
  value != null &&
  value !== '' &&
  Number.isFinite(Number(value)) &&
  Number(value) > 0;

/** A股交易样本含ST；停牌/无成交不进入分母。价格与SMA使用同一后复权口径。 */
export function marketBreadth(
  daily: { tsCode: string; amount: unknown }[],
  factors: BreadthFactor[],
  scope: MarketScope,
  listingDates: Map<string, string>,
  cutoffs: { ma20: string | null; ma60: string | null },
): MarketBreadth {
  const rows = daily.filter(
    (r) => inScope(r.tsCode, scope) && positive(r.amount),
  );
  const byCode = new Map(factors.map((r) => [r.tsCode, r]));
  const measure = (key: 'ma20' | 'ma60'): BreadthMeasure => {
    let above = 0;
    let eligible = 0;
    let insufficient = 0;
    let missing = 0;
    rows.forEach((row) => {
      const factor = byCode.get(row.tsCode);
      const listed = listingDates.get(row.tsCode);
      if (cutoffs[key] && listed && listed > cutoffs[key]!) {
        insufficient += 1;
      } else if (!factor || !positive(factor.closeHfq)) {
        missing += 1;
      } else {
        const ma = factor[key === 'ma20' ? 'maHfq20' : 'maHfq60'];
        if (!positive(ma)) {
          insufficient += 1;
        } else {
          eligible += 1;
          if (Number(factor.closeHfq) > Number(ma)) above += 1;
        }
      }
    });
    return {
      above,
      eligible,
      insufficient,
      missing,
      ratio: eligible ? (above / eligible) * 100 : null,
    };
  };
  return { total: rows.length, ma20: measure('ma20'), ma60: measure('ma60') };
}

/** 缺少任何预期交易日时不计算均额；不包含当日，避免人为缩小量能变化。 */
export function priorAmountMean(
  dates: string[],
  amounts: Map<string, { amount: number }>,
  count: number,
): number | null {
  const prior = dates.slice(0, count);
  if (
    prior.length !== count ||
    prior.some((date) => !Number.isFinite(amounts.get(date)?.amount))
  )
    return null;
  return (
    prior.reduce((sum, date) => sum + amounts.get(date)!.amount, 0) / count
  );
}
