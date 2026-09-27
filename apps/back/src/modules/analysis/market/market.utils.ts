import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { inScope, MarketScope } from './market.constants';

export type MarketDailyRow = Pick<
  DailyEntity,
  | 'tsCode'
  | 'name'
  | 'amount'
  | 'pctChg'
  | 'open'
  | 'close'
  | 'preClose'
  | 'high'
  | 'low'
>;
export type MarketLimitRow = Pick<
  LimitEntity,
  'tsCode' | 'limit' | 'limitTimes'
>;
export const percentage = (n: number, d: number) =>
  d ? Math.round((n / d) * 10000) / 100 : null;
export interface MarketStats {
  amount: number;
  up: number;
  down: number;
  flat: number;
  total: number;
  upRatio: number | null;
  distribution: number[];
  limitUp: number;
  limitDown: number;
  broken: number;
  maxHeight: number;
  sealRate: number | null;
  brokenRate: number | null;
  previousSample: number;
  highOpenRate: number | null;
  riseRate: number | null;
  averageChange: number | null;
  counts: number[];
  limitAmount: number;
  chainAmount: number;
  upgrades: {
    from: number;
    numerator: number;
    denominator: number;
    rate: number | null;
  }[];
}

/** 金额在聚合边界由日线千元统一转为亿元。前日关联使用标准代码。 */
export function marketStats(
  scope: MarketScope,
  daily: MarketDailyRow[],
  limits: MarketLimitRow[],
  previous: MarketDailyRow[],
  previousLimits: MarketLimitRow[],
  canonical: (code: string) => string = (code) => code,
): MarketStats {
  const rows = daily.filter(
    (r) => inScope(r.tsCode, scope) && Number(r.amount) > 0,
  );
  const currentByCode = new Map(rows.map((r) => [canonical(r.tsCode), r]));
  const list = limits.filter((r) => inScope(r.tsCode, scope));
  const byType = (type: string) =>
    new Set(
      list.filter((r) => r.limit === type).map((r) => canonical(r.tsCode)),
    );
  const up = byType('U');
  const down = byType('D');
  const broken = byType('Z');
  // 收盘封住的股票不会重复算作收盘炸板。
  up.forEach((code) => broken.delete(code));
  const previousUp = previousLimits.filter(
    (r) => r.limit === 'U' && inScope(r.tsCode, scope),
  );
  const previousCodes = new Set(previousUp.map((r) => canonical(r.tsCode)));
  const sample = previous
    .filter(
      (r) =>
        previousCodes.has(canonical(r.tsCode)) &&
        !/ST|^[NC]|退/.test(r.name) &&
        Number(r.high) !== Number(r.low),
    )
    .map((r) => currentByCode.get(canonical(r.tsCode)))
    .filter((r): r is MarketDailyRow => !!r && Number(r.preClose) > 0);
  const distribution = Array(21).fill(0) as number[];
  rows.forEach((r) => {
    const change = Number(r.pctChg);
    let bin = 10;
    if (change <= -9) bin = 0;
    else if (change >= 9) bin = 20;
    else if (change < 0) bin = Math.ceil(change) + 9;
    else if (change > 0) bin = Math.floor(change) + 11;
    distribution[bin] += 1;
  });
  const winners = rows.filter((r) => Number(r.pctChg) > 0).length;
  const losers = rows.filter((r) => Number(r.pctChg) < 0).length;
  const currentLimits = new Map(
    list.filter((r) => r.limit === 'U').map((r) => [canonical(r.tsCode), r]),
  );
  const counts = [1, 2, 3, 4].map(
    (n) =>
      [...currentLimits.values()].filter((r) =>
        n === 4 ? r.limitTimes >= 4 : r.limitTimes === n,
      ).length,
  );
  return {
    amount: rows.reduce((sum, r) => sum + Number(r.amount), 0) / 100000,
    up: winners,
    down: losers,
    flat: rows.length - winners - losers,
    total: rows.length,
    upRatio: percentage(winners, rows.length),
    distribution,
    limitUp: up.size,
    limitDown: down.size,
    broken: broken.size,
    maxHeight: Math.max(
      0,
      ...[...currentLimits.values()].map((r) => r.limitTimes || 0),
    ),
    sealRate: percentage(up.size, up.size + broken.size),
    brokenRate: percentage(broken.size, up.size + broken.size),
    previousSample: sample.length,
    highOpenRate: percentage(
      sample.filter((r) => Number(r.open) > Number(r.preClose)).length,
      sample.length,
    ),
    riseRate: percentage(
      sample.filter((r) => Number(r.pctChg) > 0).length,
      sample.length,
    ),
    averageChange: sample.length
      ? sample.reduce((sum, r) => sum + Number(r.pctChg), 0) / sample.length
      : null,
    counts,
    limitAmount:
      rows
        .filter((r) => up.has(canonical(r.tsCode)))
        .reduce((sum, r) => sum + Number(r.amount), 0) / 100000,
    chainAmount:
      rows
        .filter(
          (r) => (currentLimits.get(canonical(r.tsCode))?.limitTimes || 0) > 1,
        )
        .reduce((sum, r) => sum + Number(r.amount), 0) / 100000,
    upgrades: [1, 2, 3, 4].map((from) => {
      const cohort = previousUp.filter((r) =>
        from === 4 ? r.limitTimes >= 4 : r.limitTimes === from,
      );
      const numerator = cohort.filter(
        (r) =>
          currentLimits.get(canonical(r.tsCode))?.limitTimes ===
          r.limitTimes + 1,
      ).length;
      return {
        from,
        numerator,
        denominator: cohort.length,
        rate: percentage(numerator, cohort.length),
      };
    }),
  };
}
