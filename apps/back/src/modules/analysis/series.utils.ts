export interface ITradeDay {
  calDate: string;
  preTradeDate?: string;
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
