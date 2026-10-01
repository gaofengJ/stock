export const INTRADAY_RETENTION_DAYS = 30;
export const INTRADAY_INTERVAL_MINUTES = 5;

/** Wall-clock slots in Shanghai; lunch, weekends and off-session times are excluded. */
export function collectionSlot(now: Date) {
  const local = new Date(now.getTime() + 8 * 3600000);
  const weekday = local.getUTCDay();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (
    !Number.isFinite(local.getTime()) ||
    weekday === 0 ||
    weekday === 6 ||
    local.getUTCMinutes() % INTRADAY_INTERVAL_MINUTES !== 0 ||
    !((minutes >= 570 && minutes <= 690) || (minutes >= 780 && minutes <= 900))
  )
    return null;
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
  };
}

/** Never persist missing, error or empty upstream responses as zero breadth. */
export function parseClsCounts(body: any) {
  const counts = body?.data?.up_down_dis;
  if (body?.code !== 200 || counts?.status !== true)
    throw new Error('财联社涨跌家数暂不可用');
  const read = (value: unknown) => {
    if (
      (typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^\d+$/.test(value))
    )
      throw new Error('财联社涨跌家数字段缺失');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0)
      throw new Error('财联社涨跌家数字段异常');
    return number;
  };
  const up = read(counts.rise_num);
  const down = read(counts.fall_num);
  if (up + down < 1000 || up + down > 20000)
    throw new Error('财联社市场样本数量异常');
  return { up, down };
}
