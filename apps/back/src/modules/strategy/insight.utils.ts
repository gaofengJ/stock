/* eslint-disable no-restricted-syntax, no-continue -- Ordered finite price windows and rank groups. */
import { normalizeTrendSeries, TrendPoint } from './trend-rules';
import { StockInsight, HotStock } from './insight.entity';
import { MARKET_SCOPES, inScope } from '../analysis/market/market.constants';

export const INSIGHT_VERSION = 'signals-20261004-v1';
export const HORIZONS = [1, 3, 5, 10] as const;
const round = (v: number) => Math.round(v * 10000) / 10000;
export const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

export function stockInsight(
  code: string,
  name: string,
  dates: string[],
  points: Map<string, TrendPoint>,
  traded: boolean,
): StockInsight {
  const values = dates.map((d) => points.get(d));
  const today = values.at(-1);
  const periods: StockInsight['periods'] = {};
  for (const period of [20, 60]) {
    const slice = values.slice(-(period + 1));
    const normalized = normalizeTrendSeries(slice, code, period + 1);
    if (
      !traded ||
      slice.length !== period + 1 ||
      !normalized ||
      !normalized.every((p) => p && positive(p.close))
    ) {
      periods[period] = null;
      continue;
    }
    const closes = normalized.map((p) => p!.close);
    const current = closes.at(-1)!;
    const prior = closes.slice(0, -1);
    const epsilon = Math.max(current, ...prior) * 1e-10;
    periods[period] = {
      change: round((current / prior[0] - 1) * 100),
      rps: null,
      high: current - Math.max(...prior) > epsilon,
      low: Math.min(...prior) - current > epsilon,
    };
  }
  return {
    code,
    name,
    close: today && positive(today.close) ? today.close : null,
    basis: today?.basis || code,
    conversion: today?.conversion ?? null,
    traded,
    periods,
  };
}

/** Equal returns have equal ranks; percentile is 0..100, one sample has no rank. */
export function rankInsights(rows: StockInsight[]) {
  for (const period of [20, 60]) {
    const eligible = rows
      .filter((r) => r.periods[period])
      .sort((a, b) => a.periods[period]!.change - b.periods[period]!.change);
    for (let i = 0; i < eligible.length; ) {
      let end = i + 1;
      while (
        end < eligible.length &&
        eligible[end].periods[period]!.change ===
          eligible[i].periods[period]!.change
      )
        end += 1;
      const rps =
        eligible.length > 1
          ? round(((i + end - 1) / 2 / (eligible.length - 1)) * 100)
          : null;
      for (let k = i; k < end; k += 1) eligible[k].periods[period]!.rps = rps;
      i = end;
    }
  }
  return Object.fromEntries(
    MARKET_SCOPES.map((scope) => {
      const universe = rows.filter((r) => inScope(r.code, scope) && r.traded);
      return [
        scope,
        Object.fromEntries(
          [20, 60].map((period) => {
            const valid = universe.filter((r) => r.periods[period]);
            const high = valid.filter((r) => r.periods[period]!.high).length;
            const low = valid.filter((r) => r.periods[period]!.low).length;
            return [
              period,
              {
                total: universe.length,
                eligible: valid.length,
                excluded: universe.length - valid.length,
                high,
                low,
                highRatio: valid.length
                  ? round((high / valid.length) * 100)
                  : null,
                lowRatio: valid.length
                  ? round((low / valid.length) * 100)
                  : null,
              },
            ];
          }),
        ),
      ];
    }),
  );
}

export function observationReturn(start?: StockInsight, end?: StockInsight) {
  if (
    !start?.traded ||
    !end?.traded ||
    !positive(start.close) ||
    !positive(end.close)
  )
    return null;
  let base = start.close;
  if (start.basis !== end.basis) {
    if (end.basis !== end.code || !positive(end.conversion)) return null;
    base *= end.conversion;
  }
  return round((end.close / base - 1) * 100);
}
export function summarizeReturns(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = sorted.length;
  return {
    sample: n,
    average: n ? round(sorted.reduce((s, v) => s + v, 0) / n) : null,
    median: n
      ? round((sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2)
      : null,
    riseRate: n ? round((sorted.filter((v) => v > 0).length / n) * 100) : null,
  };
}
export function hotChanges(
  current: HotStock[],
  previous: HotStock[] | null,
  complete = true,
) {
  const prior = new Map(previous?.map((r) => [r.code, r]));
  const absent = previous === null || !complete ? 'unknown' : 'new';
  return current.map((r) => ({
    ...r,
    previousRank: prior.get(r.code)?.rank ?? null,
    change: prior.has(r.code) ? prior.get(r.code)!.rank - r.rank : null,
    state: prior.has(r.code) ? 'ranked' : absent,
  }));
}
