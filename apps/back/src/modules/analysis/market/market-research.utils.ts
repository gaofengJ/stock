import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { inScope, MarketScope } from './market.constants';
import { percentage } from './market.utils';

export type ResearchDaily = Pick<
  DailyEntity,
  | 'tradeDate'
  | 'tsCode'
  | 'name'
  | 'pctChg'
  | 'amount'
  | 'open'
  | 'preClose'
  | 'close'
  | 'high'
  | 'low'
>;
export type ResearchLimit = Pick<
  LimitEntity,
  'tradeDate' | 'tsCode' | 'name' | 'limit' | 'limitTimes'
>;
export const STRATEGY_LABELS: Record<string, string> = {
  volumeBreakout: '放量突破',
  breakoutPullback: '缩量回踩企稳',
  fiveMaUp: '五线顺上新形成',
  gapThreeUp: '缺口后三连阳',
  gapTwoUp: '缺口后二连阳',
  gapThreeHighTurnover: '缺口后三日高换手',
  threeDaysHighVol: '三日收阳',
  continuousGap: '连续向上缺口',
  shadowWrap: '跳空上影反包',
};
export const FEEDBACK_GROUPS = [
  { key: 'first', name: '昨日首板' },
  { key: 'chain', name: '昨日连板' },
  { key: 'broken', name: '昨日炸板' },
  { key: 'failed', name: '昨日断板' },
];
export const FEEDBACK_BINS = [
  '≤-9%',
  '-9~-5%',
  '-5~0%',
  '平盘',
  '0~5%',
  '5~9%',
  '≥9%',
];
const bin = (value: number) => {
  if (value <= -9) return 0;
  if (value < -5) return 1;
  if (value < 0) return 2;
  if (value === 0) return 3;
  if (value < 5) return 4;
  if (value < 9) return 5;
  return 6;
};

export function feedbackGroups(
  date: string,
  previousDate: string,
  earlierDate: string | null,
  daily: ResearchDaily[],
  limits: ResearchLimit[],
  scope: MarketScope,
  canonical: (code: string) => string = (code) => code,
) {
  const prices = new Map(
    daily.map((r) => [`${r.tradeDate}:${canonical(r.tsCode)}`, r]),
  );
  const events = new Map<string, ResearchLimit>();
  limits
    .filter((r) => inScope(canonical(r.tsCode), scope))
    .forEach((r) =>
      events.set(`${r.tradeDate}:${canonical(r.tsCode)}:${r.limit}`, r),
    );
  const previous = [...events.values()].filter(
    (r) => r.tradeDate === previousDate,
  );
  const previousUp = new Set(
    previous.filter((r) => r.limit === 'U').map((r) => canonical(r.tsCode)),
  );
  const sets = [
    previous.filter((r) => r.limit === 'U' && r.limitTimes === 1),
    previous.filter((r) => r.limit === 'U' && r.limitTimes >= 2),
    previous.filter(
      (r) => r.limit === 'Z' && !previousUp.has(canonical(r.tsCode)),
    ),
    [...events.values()].filter(
      (r) =>
        r.tradeDate === earlierDate &&
        r.limit === 'U' &&
        r.limitTimes >= 2 &&
        !previousUp.has(canonical(r.tsCode)) &&
        Number(prices.get(`${previousDate}:${canonical(r.tsCode)}`)?.amount) >
          0,
    ),
  ];
  return FEEDBACK_GROUPS.map((group, index) => {
    const members = sets[index].map((event) => {
      const tsCode = canonical(event.tsCode);
      const old = prices.get(`${previousDate}:${tsCode}`);
      const today = prices.get(`${date}:${tsCode}`);
      let excluded = '';
      if (!old) excluded = '昨日行情缺失';
      else if (!(Number(old.amount) > 0)) excluded = '昨日无成交';
      else if (/ST|^[NC]|退/.test(old.name)) excluded = 'ST／新股／退市整理';
      else if (index < 2 && Number(old.high) === Number(old.low))
        excluded = '昨日一字板';
      else if (!today) excluded = '今日行情缺失';
      else if (!(Number(today.amount) > 0)) excluded = '今日无成交';
      else if (
        !(Number(today.preClose) > 0) ||
        !(Number(today.open) > 0) ||
        !Number.isFinite(Number(today.pctChg))
      )
        excluded = '今日价格无效';
      return {
        tsCode,
        name: today?.name || old?.name || event.name,
        pctChg:
          today &&
          Number(today.amount) > 0 &&
          Number.isFinite(Number(today.pctChg))
            ? Number(today.pctChg)
            : null,
        highOpen: today ? Number(today.open) > Number(today.preClose) : false,
        previousHeight:
          old && Number(old.amount) > 0
            ? events.get(`${previousDate}:${tsCode}:U`)?.limitTimes || 0
            : null,
        height:
          today && Number(today.amount) > 0
            ? events.get(`${date}:${tsCode}:U`)?.limitTimes || 0
            : null,
        excluded,
      };
    });
    const values = members
      .filter((r) => !r.excluded)
      .map((r) => r.pctChg!)
      .sort((a, b) => a - b);
    const distribution = Array(7).fill(0) as number[];
    values.forEach((v) => {
      distribution[bin(v)] += 1;
    });
    const n = values.length;
    const middle = Math.floor(n / 2);
    const median =
      n % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    return {
      ...group,
      total: members.length,
      sample: n,
      excluded: members.length - n,
      average: n ? values.reduce((sum, v) => sum + v, 0) / n : null,
      median: n ? median : null,
      riseRate: percentage(values.filter((v) => v > 0).length, n),
      highOpenRate: percentage(
        members.filter((r) => !r.excluded && r.highOpen).length,
        n,
      ),
      distribution,
      members,
    };
  });
}

export function trajectoryCell(
  date: string,
  ready: boolean,
  today?: ResearchDaily,
  events?: ResearchLimit[],
  prior?: ResearchLimit,
) {
  if (!ready) return { date, state: '待更新', height: null, pctChg: null };
  if (!today) return { date, state: '无行情', height: null, pctChg: null };
  if (!(Number(today.amount) > 0))
    return { date, state: '无成交', height: null, pctChg: null };
  const selected = events || [];
  const up = selected.find((r) => r.limit === 'U');
  let state = '交易';
  if (up) state = up.limitTimes === 1 ? '首板' : `${up.limitTimes}板`;
  if (!up && selected.some((r) => r.limit === 'Z')) state = '炸板';
  else if (!up && selected.some((r) => r.limit === 'D')) state = '跌停';
  else if (!up && (prior?.limitTimes || 0) >= 2) state = '断板';
  return {
    date,
    state,
    height: up?.limitTimes || 0,
    pctChg: Number(today.pctChg),
    close: Number(today.close),
    amount: Number(today.amount) / 100000,
  };
}
