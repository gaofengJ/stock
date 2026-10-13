import type { DataSource } from 'typeorm';

export interface ITradeDay {
  calDate: string;
  preTradeDate?: string;
}

export type SeriesState =
  | 'ready'
  | 'missing'
  | 'pending'
  | 'running'
  | 'failed'
  | 'protected';

type NullableFields<T, K extends keyof T> = { [P in K]: T[P] | null };

/** One indexed query per requested window, including prior-day dependencies. */
export async function readSeriesStates(
  db: Pick<DataSource, 'query'>,
  days: ITradeDay[],
) {
  const dates = [
    ...new Set(
      days.flatMap((day) => [day.calDate, day.preTradeDate]).filter(Boolean),
    ),
  ];
  if (!dates.length) return new Map<string, SeriesState>();
  const rows: { date: string; state: SeriesState }[] = await db.query(
    `SELECT DATE_FORMAT(c.cal_date,'%Y-%m-%d') date,
      CASE WHEN p.trade_date IS NOT NULL THEN 'protected'
        WHEN r.status='success' THEN 'ready'
        WHEN r.status IN ('pending','running','failed') THEN r.status
        WHEN r.task IS NOT NULL THEN 'missing'
        WHEN EXISTS(SELECT 1 FROM t_source_daily d WHERE d.trade_date=c.cal_date)
          AND EXISTS(SELECT 1 FROM t_source_limit l WHERE l.trade_date=c.cal_date)
          THEN 'ready'
        ELSE 'missing' END state
      FROM t_source_trade_cal c
      LEFT JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='daily'
      LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date
      WHERE c.is_open=1 AND c.cal_date IN (?)`,
    [dates],
  );
  // Legacy data predates t_sync_run. Match SyncWriteService.rawReady's legacy
  // evidence (daily + limit rows), never infer readiness from a sparse chart.
  return new Map(rows.map((row) => [row.date, row.state]));
}

/** Keep real zeroes, but never turn unpublished/deleted data into a zero point. */
export function applySeriesStates<
  T extends { tradeDate: string },
  K extends keyof T,
>(
  points: T[],
  states: ReadonlyMap<string, SeriesState>,
  valueFields: K[],
  dependencies: ITradeDay[] = [],
): (Omit<T, K> & NullableFields<T, K> & { state: SeriesState })[] {
  const previous = new Map(
    dependencies.map((day) => [day.calDate, day.preTradeDate]),
  );
  return points.map((point) => {
    let state = states.get(point.tradeDate) || 'missing';
    if (state === 'ready' && previous.has(point.tradeDate)) {
      const prior = previous.get(point.tradeDate);
      state = (prior && states.get(prior)) || 'missing';
    }
    const values = Object.fromEntries(
      valueFields.map((field) => [
        field,
        state === 'ready' ? point[field] : null,
      ]),
    ) as NullableFields<T, K>;
    return { ...point, ...values, state };
  });
}

interface ICountPoint {
  tradeDate: string;
  count: number;
}

interface IAmountPoint {
  tradeDate: string;
  totalAmount: number;
}

/**
 * 交易日接口没有承诺返回顺序，分析层统一按日期升序输出。
 */
export const sortTradeDays = <T extends ITradeDay>(tradeDays: T[]) =>
  [...tradeDays].sort((a, b) => a.calDate.localeCompare(b.calDate));

export const fillTradeDateSeries = <T extends { tradeDate: string }>(
  tradeDays: ITradeDay[],
  source: T[],
  createEmptyPoint: (tradeDate: string) => T,
) => {
  const sourceMap = new Map(source.map((item) => [item.tradeDate, item]));
  return sortTradeDays(tradeDays).map(
    ({ calDate }) => sourceMap.get(calDate) ?? createEmptyPoint(calDate),
  );
};

export const fillCountSeries = (
  tradeDays: ITradeDay[],
  source: ICountPoint[],
) => {
  const sourceMap = new Map(source.map((item) => [item.tradeDate, item.count]));
  return sortTradeDays(tradeDays).map(({ calDate }) => ({
    tradeDate: calDate,
    count: sourceMap.get(calDate) ?? 0,
  }));
};

export const fillAmountSeries = (
  tradeDays: ITradeDay[],
  source: IAmountPoint[],
) => {
  const sourceMap = new Map(
    source.map((item) => [item.tradeDate, item.totalAmount]),
  );
  return sortTradeDays(tradeDays).map(({ calDate }) => ({
    tradeDate: calDate,
    totalAmount: sourceMap.get(calDate) ?? 0,
  }));
};

/**
 * N-1 到 N 的晋级率：当天 N 板数量 / 前一交易日 N-1 板数量。
 */
export const calculateUpgradeRates = (
  tradeDays: ITradeDay[],
  numerator: ICountPoint[],
  denominator: ICountPoint[],
) => {
  const numeratorMap = new Map(
    numerator.map((item) => [item.tradeDate, item.count]),
  );
  const denominatorMap = new Map(
    denominator.map((item) => [item.tradeDate, item.count]),
  );

  return sortTradeDays(tradeDays).map(({ calDate, preTradeDate }) => {
    const num = numeratorMap.get(calDate) ?? 0;
    const denom = preTradeDate ? denominatorMap.get(preTradeDate) ?? 0 : 0;
    return {
      tradeDate: calDate,
      rate: num && denom ? Math.round((num / denom) * 100) : 0,
    };
  });
};

/**
 * 首板成功率：首板数量 / (首板数量 + 炸板数量)。
 */
export const calculateFirstUpgradeRates = (
  tradeDays: ITradeDay[],
  limitUpList: ICountPoint[],
  brokenLimitList: ICountPoint[],
) => {
  const limitUpMap = new Map(
    limitUpList.map((item) => [item.tradeDate, item.count]),
  );
  const brokenLimitMap = new Map(
    brokenLimitList.map((item) => [item.tradeDate, item.count]),
  );

  return sortTradeDays(tradeDays).map(({ calDate }) => {
    const limitUpCount = limitUpMap.get(calDate) ?? 0;
    const brokenLimitCount = brokenLimitMap.get(calDate) ?? 0;
    const total = limitUpCount + brokenLimitCount;
    return {
      tradeDate: calDate,
      rate: total ? Math.round((limitUpCount / total) * 100) : 0,
    };
  });
};
