import * as dayjs from 'dayjs';
import { DailyEntity } from '../source/daily/daily.entity';
import { LimitEntity } from '../source/limit/limit.entity';

// 不依赖服务器操作系统时区。
export function shanghaiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day']
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join('-');
}

export function latestSyncDate(now = new Date()): string {
  const date = shanghaiDate(now);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return time >= '20:30'
    ? date
    : dayjs(date).subtract(1, 'day').format('YYYY-MM-DD');
}

export function normalizeDate(value: string): string {
  const date = dayjs(value);
  const normalized = date.format('YYYY-MM-DD');
  if (
    !value ||
    !date.isValid() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    normalized !== value
  ) {
    throw new Error(`无效日期: ${value}`);
  }
  return normalized;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function permanentSyncError(error: unknown): boolean {
  return /权限|积分|每天|每日|配额|token.*(无效|错误)|permanent:/i.test(
    errorMessage(error),
  );
}

export function eveningSlot(now: Date): string | undefined {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  if (time === '07:30') return '0730';
  if (time < '20:30' || time > '22:00') return undefined;
  return ['20:30', '20:45', '21:00', '21:15', '21:30', '21:45', '22:00']
    .filter((slot) => slot <= time)
    .pop()
    ?.replace(':', '');
}

type Daily = Pick<
  DailyEntity,
  'tsCode' | 'name' | 'high' | 'low' | 'open' | 'close' | 'preClose'
>;
type Limit = Pick<LimitEntity, 'tsCode' | 'name' | 'limit'>;

export function calculateMood(
  date: string,
  current: Daily[],
  limits: Limit[],
  previous: Daily[],
  previousLimits: Limit[],
) {
  const up = new Set(
    limits.filter((i) => i.limit === 'U').map((i) => i.tsCode),
  );
  const previousUp = new Set(
    previousLimits.filter((i) => i.limit === 'U').map((i) => i.tsCode),
  );
  const eligible = (i: Daily) =>
    !/ST|N|C/.test(i.name) && Number(i.high) !== Number(i.low);
  const previousEligible = previous.filter(
    (i) => previousUp.has(i.tsCode) && eligible(i),
  );
  const currentByCode = new Map(current.map((i) => [i.tsCode, i]));
  const a = current.filter((i) => up.has(i.tsCode) && eligible(i)).length;
  const b = previousEligible.length;
  const c = previousEligible.filter((i) => {
    const today = currentByCode.get(i.tsCode);
    return today && Number(today.open) > Number(today.preClose);
  }).length;
  const d = previousEligible.filter((i) => {
    const today = currentByCode.get(i.tsCode);
    return today && Number(today.close) > Number(today.preClose);
  }).length;
  const e = limits.filter(
    (i) => i.limit === 'Z' && !/ST|N|C/.test(i.name),
  ).length;
  // 保留原有百分比取整口径，修复分母为零时写入 NaN/Infinity。
  const percent = (n: number, total: number) =>
    `${total ? Math.floor(n / total / 0.01) : 0}`;
  return {
    tradeDate: date,
    a,
    b,
    c,
    d,
    e,
    sentiA: `${a}`,
    sentiB: percent(c, b),
    sentiC: percent(d, b),
    sentiD: percent(e, a + e),
  };
}
