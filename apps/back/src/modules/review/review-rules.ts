export function positiveNumber(value: unknown) {
  return value != null &&
    value !== '' &&
    Number.isFinite(Number(value)) &&
    Number(value) > 0
    ? Number(value)
    : null;
}

/** Tushare daily market caps are in 10,000 CNY, not CNY. */
export function capStatus(value: unknown) {
  const cap = positiveNumber(value);
  if (cap == null) return 'missing';
  return cap < 200 * 10000 ? 'within' : 'outside';
}

export function ma5Observation(
  series: { date: string; close: number | null }[],
  date: string,
) {
  const rows = series.filter((r) => r.date <= date).slice(-6);
  if (
    rows.length !== 6 ||
    rows.at(-1)?.date !== date ||
    rows.some((r) => positiveNumber(r.close) == null)
  )
    return {
      state: 'missing',
      label: '连续行情不足，暂不能判断5日线',
      ma5: null,
      previousMa5: null,
    };
  const previousMa5 =
    rows.slice(0, 5).reduce((sum, r) => sum + Number(r.close), 0) / 5;
  const ma5 = rows.slice(1).reduce((sum, r) => sum + Number(r.close), 0) / 5;
  const previousBelow = Number(rows[4].close) < previousMa5 - 1e-8;
  const below = Number(rows[5].close) < ma5 - 1e-8;
  let state = 'above';
  let label = '收盘在5日线上或线上方';
  if (previousBelow && below) {
    state = 'unrecovered';
    label = '连续两交易日收盘低于各自5日线，符合未收回观察条件';
  } else if (below) {
    state = 'watch';
    label = '收盘跌破5日线，等待下一交易日确认';
  } else if (previousBelow) {
    state = 'recovered';
    label = '前一交易日低于5日线，本日已收回';
  }
  return { state, label, ma5, previousMa5 };
}
