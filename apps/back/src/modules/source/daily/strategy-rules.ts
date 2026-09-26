type NumericValue = string | number | null | undefined;

export interface StrategyDailySnapshot {
  name: string;
  open: NumericValue;
  close: NumericValue;
  high: NumericValue;
  low: NumericValue;
  preClose: NumericValue;
  vol: NumericValue;
  amount: NumericValue;
  upLimit: NumericValue;
  turnoverRateF?: NumericValue;
  volumeRatio?: NumericValue;
}

const MIN_HIGH_TURNOVER_RATE = 5;
const ONE_HUNDRED_MILLION_YUAN_IN_THOUSAND_YUAN = 100_000;
const MIN_ACTIVE_TRADING_AMOUNT = ONE_HUNDRED_MILLION_YUAN_IN_THOUSAND_YUAN;

function toNumber(value: NumericValue) {
  return Number(value);
}

function isPositive(value: NumericValue) {
  const number = toNumber(value);
  return Number.isFinite(number) && number > 0;
}

function isSamePrice(left: NumericValue, right: NumericValue) {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  return (
    Number.isFinite(leftNumber) &&
    Number.isFinite(rightNumber) &&
    leftNumber === rightNumber
  );
}

function isRegularStockName(name: string) {
  const normalizedName = name.trim().toUpperCase();
  return (
    normalizedName.length > 0 &&
    !/^(N|C)/.test(normalizedName) &&
    !/(\*?ST|退)/.test(normalizedName)
  );
}

function isValidTradingDay(day: StrategyDailySnapshot) {
  return (
    isRegularStockName(day.name) &&
    isPositive(day.open) &&
    isPositive(day.close) &&
    isPositive(day.high) &&
    isPositive(day.low) &&
    isPositive(day.preClose) &&
    isPositive(day.vol) &&
    isPositive(day.amount)
  );
}

function hasComparablePriceBasis(
  previous: StrategyDailySnapshot,
  current: StrategyDailySnapshot,
) {
  // Tushare daily 的 preClose 在除权日会使用除权价。若它和上一日原始
  // 收盘价不一致，跨日高低价已不在同一价格基准，不能用于缺口判断。
  return isSamePrice(previous.close, current.preClose);
}

function hasComparableSequence(days: StrategyDailySnapshot[]) {
  return days.every((day, index) => {
    if (!isValidTradingDay(day)) return false;
    if (index === 0) return true;
    return hasComparablePriceBasis(days[index - 1], day);
  });
}

function isBullish(day: StrategyDailySnapshot) {
  return toNumber(day.close) > toNumber(day.open);
}

function isStrongClose(day: StrategyDailySnapshot) {
  const midpoint = (toNumber(day.high) + toNumber(day.low)) / 2;
  return toNumber(day.close) >= midpoint;
}

function isOnePriceLimitUp(day: StrategyDailySnapshot) {
  if (!isPositive(day.upLimit)) return false;
  return (
    isSamePrice(day.close, day.upLimit) &&
    isSamePrice(day.open, day.close) &&
    isSamePrice(day.high, day.close) &&
    isSamePrice(day.low, day.close)
  );
}

function hasUpwardGap(
  previous: StrategyDailySnapshot,
  current: StrategyDailySnapshot,
) {
  return toNumber(current.low) > toNumber(previous.high);
}

function keepsGap(
  base: StrategyDailySnapshot,
  followingDays: StrategyDailySnapshot[],
) {
  const gapTop = toNumber(base.high);
  return followingDays.every((day) => toNumber(day.low) > gapTop);
}

function hasDominantUpperShadow(day: StrategyDailySnapshot) {
  const high = toNumber(day.high);
  const low = toNumber(day.low);
  const open = toNumber(day.open);
  const close = toNumber(day.close);
  const range = high - low;
  const upperShadow = high - Math.max(open, close);
  const body = Math.abs(close - open);
  const lowerShadow = Math.min(open, close) - low;

  // 上影是全天 K 线的主导部分，避免固定 3% 在不同板块波动限制下
  // 含义不一致。
  return range > 0 && upperShadow > body && upperShadow > lowerShadow;
}

function hasNoOnePriceLimitUp(days: StrategyDailySnapshot[]) {
  return days.every((day) => !isOnePriceLimitUp(day));
}

function hasActiveTurnoverAndAmount(
  day: StrategyDailySnapshot,
  baseline: StrategyDailySnapshot,
) {
  // DailyEntity.amount 的单位是千元，100_000 即 1 亿元。这里只设置
  // 短线活跃度下限；成交额上限会随市场总成交额变化，不使用固定值硬过滤。
  return (
    toNumber(day.turnoverRateF) > MIN_HIGH_TURNOVER_RATE &&
    toNumber(day.turnoverRateF) > toNumber(baseline.turnoverRateF) &&
    toNumber(day.amount) >= MIN_ACTIVE_TRADING_AMOUNT
  );
}

export function matchesGapThreeUp(
  d1: StrategyDailySnapshot,
  d2: StrategyDailySnapshot,
  d3: StrategyDailySnapshot,
  d4: StrategyDailySnapshot,
) {
  return (
    hasComparableSequence([d1, d2, d3, d4]) &&
    hasUpwardGap(d1, d2) &&
    keepsGap(d1, [d2, d3, d4]) &&
    isBullish(d2) &&
    isBullish(d3) &&
    isBullish(d4) &&
    toNumber(d3.close) > toNumber(d2.close) &&
    toNumber(d4.close) > toNumber(d3.close) &&
    isStrongClose(d4) &&
    hasNoOnePriceLimitUp([d2, d3, d4])
  );
}

export function matchesGapTwoUp(
  d1: StrategyDailySnapshot,
  d2: StrategyDailySnapshot,
  d3: StrategyDailySnapshot,
) {
  return (
    hasComparableSequence([d1, d2, d3]) &&
    hasUpwardGap(d1, d2) &&
    keepsGap(d1, [d2, d3]) &&
    isBullish(d2) &&
    isBullish(d3) &&
    toNumber(d3.close) > toNumber(d2.close) &&
    isStrongClose(d3) &&
    hasNoOnePriceLimitUp([d2, d3])
  );
}

export function matchesGapThreeHighTurnover(
  d1: StrategyDailySnapshot,
  d2: StrategyDailySnapshot,
  d3: StrategyDailySnapshot,
  d4: StrategyDailySnapshot,
) {
  return (
    hasComparableSequence([d1, d2, d3, d4]) &&
    hasUpwardGap(d1, d2) &&
    keepsGap(d1, [d2, d3, d4]) &&
    hasActiveTurnoverAndAmount(d2, d1) &&
    hasActiveTurnoverAndAmount(d3, d1) &&
    hasActiveTurnoverAndAmount(d4, d1) &&
    toNumber(d2.amount) > toNumber(d1.amount) &&
    toNumber(d3.close) >= toNumber(d2.close) &&
    toNumber(d4.close) > toNumber(d2.close) &&
    toNumber(d4.close) >= toNumber(d3.close) &&
    isBullish(d4) &&
    isStrongClose(d4) &&
    hasNoOnePriceLimitUp([d2, d3, d4])
  );
}

export function matchesThreeDaysHighVol(
  d1: StrategyDailySnapshot,
  d2: StrategyDailySnapshot,
  d3: StrategyDailySnapshot,
) {
  return (
    hasComparableSequence([d1, d2, d3]) &&
    toNumber(d1.volumeRatio) > 1 &&
    toNumber(d2.volumeRatio) > 1 &&
    toNumber(d3.volumeRatio) > 1 &&
    toNumber(d2.vol) >= toNumber(d1.vol) &&
    toNumber(d3.vol) >= toNumber(d2.vol) &&
    isBullish(d1) &&
    isBullish(d2) &&
    isBullish(d3) &&
    toNumber(d2.close) > toNumber(d1.close) &&
    toNumber(d3.close) > toNumber(d2.close) &&
    isStrongClose(d3) &&
    hasNoOnePriceLimitUp([d1, d2, d3])
  );
}

export function matchesContinuousGap(
  d1: StrategyDailySnapshot,
  d2: StrategyDailySnapshot,
  d3: StrategyDailySnapshot,
) {
  return (
    hasComparableSequence([d1, d2, d3]) &&
    hasUpwardGap(d1, d2) &&
    hasUpwardGap(d2, d3) &&
    isBullish(d3) &&
    isStrongClose(d3) &&
    hasNoOnePriceLimitUp([d2, d3])
  );
}

export function matchesShadowWrap(
  d1: StrategyDailySnapshot,
  d2: StrategyDailySnapshot,
  d3: StrategyDailySnapshot,
) {
  return (
    hasComparableSequence([d1, d2, d3]) &&
    hasUpwardGap(d1, d2) &&
    keepsGap(d1, [d2, d3]) &&
    hasDominantUpperShadow(d2) &&
    toNumber(d3.close) > toNumber(d2.high) &&
    toNumber(d3.vol) >= toNumber(d2.vol) &&
    isBullish(d3) &&
    isStrongClose(d3) &&
    hasNoOnePriceLimitUp([d2, d3])
  );
}
