/* eslint-disable no-continue -- Ordered breakout search skips dates without a signal. */
export const TREND_KEYS = [
  'volumeBreakout',
  'breakoutPullback',
  'fiveMaUp',
] as const;
export type TrendKey = (typeof TREND_KEYS)[number];
export interface TrendOptions {
  breakoutDays?: number;
  volumeDays?: number;
  volumeMultiple?: number;
  pullbackDays?: number;
  pullbackBelow?: number;
  pullbackAbove?: number;
  contractionRatio?: number;
  fiveMaMode?: 'new' | 'current';
  aboveMa5?: boolean;
  bullish?: boolean;
  expandingVolume?: boolean;
}
export const TREND_DEFAULTS = {
  breakoutDays: 20,
  volumeDays: 5,
  volumeMultiple: 1.5,
  pullbackDays: 10,
  pullbackBelow: 2,
  pullbackAbove: 3,
  contractionRatio: 0.8,
  fiveMaMode: 'new' as const,
  aboveMa5: false,
  bullish: false,
  expandingVolume: false,
};
export type TrendPoint = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  vol?: number;
  eligible?: boolean;
};
export type TrendEvidence = {
  breakoutPrice?: number;
  breakoutPct?: number;
  volumeMultiple?: number;
  breakoutDate?: string;
  pullbackPct?: number;
  contractionRatio?: number;
  averages?: number[];
  aboveMa5Pct?: number;
  streak?: number;
  streakCapped?: boolean;
};
const finitePositive = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
const gt = (a: number, b: number) =>
  a - b > Math.max(Math.abs(a), Math.abs(b), 1) * 1e-10;
function windowAt(points: (TrendPoint | undefined)[], end: number, n: number) {
  if (end - n + 1 < 0) return null;
  const rows = points.slice(end - n + 1, end + 1);
  return rows.every(
    (p) => p && [p.open, p.close, p.high, p.low].every(finitePositive),
  )
    ? (rows as TrendPoint[])
    : null;
}
function averageVolume(
  points: (TrendPoint | undefined)[],
  end: number,
  n: number,
) {
  const rows = windowAt(points, end, n);
  return rows?.every((p) => finitePositive(p.vol))
    ? rows.reduce((sum, p) => sum + p.vol!, 0) / n
    : null;
}
export function breakoutAt(
  points: (TrendPoint | undefined)[],
  end: number,
  options: TrendOptions = {},
): TrendEvidence | null {
  const o = { ...TREND_DEFAULTS, ...options };
  const today = points[end];
  const prior = windowAt(points, end - 1, o.breakoutDays);
  const mean = averageVolume(points, end - 1, o.volumeDays);
  if (
    !today ||
    today.eligible === false ||
    !prior ||
    !mean ||
    !finitePositive(today.vol) ||
    ![today.open, today.close, today.high, today.low].every(finitePositive)
  )
    return null;
  const price = Math.max(...prior.map((p) => p.high));
  const multiple = today.vol / mean;
  if (!gt(today.close, price) || multiple + 1e-10 < o.volumeMultiple)
    return null;
  return {
    breakoutPrice: price,
    breakoutPct: (today.close / price - 1) * 100,
    volumeMultiple: multiple,
  };
}
export function pullbackAt(
  points: (TrendPoint | undefined)[],
  end: number,
  options: TrendOptions = {},
): TrendEvidence | null {
  const o = { ...TREND_DEFAULTS, ...options };
  const today = points[end];
  const previous = points[end - 1];
  if (
    !today ||
    !previous ||
    !gt(today.close, today.open) ||
    !gt(today.close, previous.close)
  )
    return null;
  // The latest breakout in the lookback is authoritative, including yesterday.
  // Never fall back to an older breakout when the latest one fails its retest.
  for (let b = end - 1; b >= Math.max(0, end - o.pullbackDays); b -= 1) {
    const breakout = breakoutAt(points, b, o);
    if (!breakout) continue;
    if (b >= end - 1) return null;
    const price = breakout.breakoutPrice!;
    const after = windowAt(points, end, end - b);
    const mean = averageVolume(points, end - 1, end - b - 1);
    if (!after || !mean || !finitePositive(points[b]?.vol)) return null;
    const contraction = mean / points[b]!.vol!;
    if (
      today.low < price * (1 - o.pullbackBelow / 100) - 1e-9 ||
      today.low > price * (1 + o.pullbackAbove / 100) + 1e-9 ||
      after.some((p) => p.close < price * (1 - o.pullbackBelow / 100) - 1e-9) ||
      !gt(today.close, price) ||
      contraction > o.contractionRatio + 1e-10
    )
      return null;
    return {
      breakoutDate: points[b]!.date,
      breakoutPrice: price,
      pullbackPct: (today.low / price - 1) * 100,
      contractionRatio: contraction,
    };
  }
  return null;
}
const periods = [5, 10, 20, 60, 120];
function averagesAt(points: (TrendPoint | undefined)[], end: number) {
  const rows = windowAt(points, end, 120);
  if (!rows) return null;
  return periods.map(
    (n) => rows.slice(-n).reduce((sum, p) => sum + p.close, 0) / n,
  );
}
export function fiveMaState(points: (TrendPoint | undefined)[], end: number) {
  const current = averagesAt(points, end);
  const previous = averagesAt(points, end - 1);
  if (!current || !previous) return null;
  return {
    averages: current,
    satisfied: current.every(
      (value, i) =>
        gt(value, previous[i]) && (i === 4 || gt(value, current[i + 1])),
    ),
  };
}
export function fiveMaAt(
  points: (TrendPoint | undefined)[],
  end: number,
  options: TrendOptions = {},
): TrendEvidence | null {
  const o = { ...TREND_DEFAULTS, ...options };
  const current = fiveMaState(points, end);
  if (!current?.satisfied) return null;
  if (o.fiveMaMode === 'new') {
    const previous = fiveMaState(points, end - 1);
    if (!previous || previous.satisfied) return null;
  }
  const today = points[end]!;
  if (
    (o.aboveMa5 && !gt(today.close, current.averages[0])) ||
    (o.bullish && !gt(today.close, today.open))
  )
    return null;
  const mean = averageVolume(points, end - 1, o.volumeDays);
  if (
    o.expandingVolume &&
    (!mean ||
      !finitePositive(today.vol) ||
      today.vol / mean + 1e-10 < o.volumeMultiple)
  )
    return null;
  let streak = 1;
  for (let i = end - 1; i >= 0 && fiveMaState(points, i)?.satisfied; i -= 1)
    streak += 1;
  return {
    averages: current.averages,
    aboveMa5Pct: (today.close / current.averages[0] - 1) * 100,
    streak,
    streakCapped: fiveMaState(points, end - streak) === null,
  };
}
export function evaluateTrend(
  key: TrendKey,
  points: (TrendPoint | undefined)[],
  options: TrendOptions = {},
) {
  const end = points.length - 1;
  if (key === 'volumeBreakout') return breakoutAt(points, end, options);
  if (key === 'breakoutPullback') return pullbackAt(points, end, options);
  return fiveMaAt(points, end, options);
}
export function requiredTrendDays(key: TrendKey, options: TrendOptions = {}) {
  const o = { ...TREND_DEFAULTS, ...options };
  if (key === 'fiveMaUp') return o.fiveMaMode === 'new' ? 122 : 121;
  const base = Math.max(o.breakoutDays, o.volumeDays) + 1;
  return key === 'breakoutPullback' ? base + o.pullbackDays : base;
}
