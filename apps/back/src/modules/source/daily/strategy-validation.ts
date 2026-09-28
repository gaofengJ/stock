type NumericValue = string | number | null | undefined;

interface StrategyTradingDay {
  name: string;
  open: NumericValue;
  close: NumericValue;
  high: NumericValue;
  low: NumericValue;
  preClose: NumericValue;
  vol: NumericValue;
  amount: NumericValue;
}

function isPositive(value: NumericValue) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

/** 日线价格列为DECIMAL(16,2)，直接转整数分，避免二进制小数边界误差。 */
function priceInCents(value: NumericValue): bigint | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function isCloseInUpperHalf(
  day: Pick<StrategyTradingDay, 'close' | 'high' | 'low'>,
) {
  const close = priceInCents(day.close);
  const high = priceInCents(day.high);
  const low = priceInCents(day.low);
  return (
    close !== null && high !== null && low !== null && close * 2n >= high + low
  );
}

export function hasUpperShadowAboveThreePercent(
  day: Pick<StrategyTradingDay, 'open' | 'close' | 'high' | 'preClose'>,
) {
  const open = priceInCents(day.open);
  const close = priceInCents(day.close);
  const high = priceInCents(day.high);
  const preClose = priceInCents(day.preClose);
  if (
    open === null ||
    close === null ||
    high === null ||
    preClose === null ||
    preClose <= 0n
  )
    return false;
  const bodyHigh = open > close ? open : close;
  return (high - bodyHigh) * 100n > preClose * 3n;
}

/** 四价相同且等于有效涨停价才是一字涨停，普通收盘涨停不在此列。 */
export function isOnePriceLimitUp(
  day: Pick<StrategyTradingDay, 'open' | 'close' | 'high' | 'low'> & {
    upLimit: NumericValue;
  },
) {
  const limit = Number(day.upLimit);
  return (
    isPositive(day.upLimit) &&
    Number(day.open) === limit &&
    Number(day.close) === limit &&
    Number(day.high) === limit &&
    Number(day.low) === limit
  );
}

/** 传入形态日（从早到晚），不含跳空前仅作参照的基准日。 */
export function meetsCommonStrategyConditions(
  days: readonly (StrategyTradingDay & { upLimit: NumericValue })[],
) {
  return (
    days.length > 0 &&
    days.every(
      (day) => Number(day.amount) > 50_000 && !isOnePriceLimitUp(day),
    ) &&
    isCloseInUpperHalf(days[days.length - 1])
  );
}

/** 校验按时间从早到晚排列的日线，不改变各策略自身的形态条件。 */
export function hasValidStrategySequence(
  days: readonly (StrategyTradingDay | null | undefined)[],
) {
  if (days.length === 0) return false;
  return days.every((day, index) => {
    if (!day || typeof day.name !== 'string') return false;
    const name = day.name.trim().toUpperCase();
    if (!name || /^(N|C)/.test(name) || /ST|退/.test(name)) return false;
    if (
      !isPositive(day.open) ||
      !isPositive(day.close) ||
      !isPositive(day.high) ||
      !isPositive(day.low) ||
      !isPositive(day.preClose) ||
      !isPositive(day.vol) ||
      !isPositive(day.amount)
    ) {
      return false;
    }
    // 价格基准发生变化时跳过，避免跨除权等日期直接比较原始价格。
    // 此处不做复权，也不要求收盘逐日上涨。
    return (
      index === 0 || Number(days[index - 1]!.close) === Number(day.preClose)
    );
  });
}
