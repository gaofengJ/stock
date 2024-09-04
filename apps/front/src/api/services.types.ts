/* eslint-disable */
/**
 * This file is automatically generated by swagger-to-ts. Do not modify it manually.
 */
/**
 * 类型名称：n+连板数量统计
 *
 * @description 接口路径：/analysis/chains/count-limit-up-above-times
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisChainsCountLimitUpAboveTimes {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
    /**
     * 连板数量
     */
    limitTimes: number;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 计数
     */
    count: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：n连板数量统计
 *
 * @description 接口路径：/analysis/chains/count-limit-up-times
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisChainsCountLimitUpTimes {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
    /**
     * 连板数量
     */
    limitTimes: number;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 计数
     */
    count: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：涨停参与金额
 *
 * @description 接口路径：/analysis/chains/limit-up-amount
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisChainsLimitUpAmount {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 金额合计(元)
     */
    totalAmount: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：连板参与金额
 *
 * @description 接口路径：/analysis/chains/upgrade-limit-up-amount
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisChainsUpgradeLimitUpAmount {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 金额合计(元)
     */
    totalAmount: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：n连板晋级成功率
 *
 * @description 接口路径：/analysis/chains/upgrade-limit-up-rates
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisChainsUpgradeLimitUpRates {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
    /**
     * 连板晋级成功率
     */
    upgradeNum: number;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 百分比
     */
    rate: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：涨停板复盘
 *
 * @description 接口路径：/analysis/limits/limit-up-list
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisLimitsLimitUpList {
  export interface IParams {
    /**
     * 日期
     */
    date: string;
  }
  export type IRes = {
    /**
     * 股票代码（包含交易所）
     */
    tsCode: string;
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 股票名称
     */
    name: string;
    /**
     * 所属行业
     */
    industry: string;
    /**
     * 收盘价(元)
     */
    close: string;
    /**
     * 涨跌幅(%)
     */
    pctChg: string;
    /**
     * 成交额(元)
     */
    amount: string;
    /**
     * 板上成交额(元)
     */
    limitAmount: string;
    /**
     * 流通市值(元)
     */
    floatMv: string;
    /**
     * 总市值(元)
     */
    totalMv: string;
    /**
     * 换手率(%)
     */
    turnoverRatio: string;
    /**
     * 封单金额(元)
     */
    fdAmount: string;
    /**
     * 首次封板时间
     */
    firstTime: string;
    /**
     * 最后封板时间
     */
    lastTime: string;
    /**
     * 打开次数
     */
    openTimes: number;
    /**
     * 涨停统计（N/T T天有N次涨停）
     */
    upStat: string;
    /**
     * 连板数
     */
    limitTimes: number;
    /**
     * D跌停，U涨停，Z炸板
     */
    limit: string;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：涨跌分布统计
 *
 * @description 接口路径：/analysis/senti/distribution-tatistics
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisSentiDistributionTatistics {
  export interface IParams {
    /**
     * 日期
     */
    date: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 计数
     */
    count: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：连日涨跌停统计
 *
 * @description 接口路径：/analysis/senti/limit-up-down-count
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisSentiLimitUpDownCount {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 涨停家数
     */
    limitUCount: number;
    /**
     * 跌停家数
     */
    limitDCount: number;
    /**
     * 炸板家数
     */
    limitZCount: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：连日涨停板高度统计
 *
 * @description 接口路径：/analysis/senti/limit-up-max-times-count
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisSentiLimitUpMaxTimesCount {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 连板高度
     */
    maxLimitTimes: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：查询短线情绪
 *
 * @description 接口路径：/analysis/senti/list
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisSentiList {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 当日涨停，非一字涨停，非ST
     */
    a: number;
    /**
     * 前一日涨停，非一字涨停，非ST
     */
    b: number;
    /**
     * 前一日涨停，非一字涨停，非ST，当日高开
     */
    c: number;
    /**
     * 前一日涨停，非一字涨停，非ST，当日上涨
     */
    d: number;
    /**
     * 当日曾涨停，非ST
     */
    e: number;
    /**
     * 非一字涨停
     */
    sentiA: string;
    /**
     * 打板高开率(%)
     */
    sentiB: string;
    /**
     * 打板成功率(%)
     */
    sentiC: string;
    /**
     * 打板被砸率(%)
     */
    sentiD: string;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：连日涨跌统计
 *
 * @description 接口路径：/analysis/senti/up-down-count
 * @description 接口分组：数据分析
 */
export namespace NSGetAnalysisSentiUpDownCount {
  export interface IParams {
    /**
     * 开始日期
     */
    startDate: string;
    /**
     * 结束日期
     */
    endDate: string;
  }
  export type IRes = {
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 上涨家数
     */
    upCount: number;
    /**
     * 平盘家数
     */
    flatCount: number;
    /**
     * 下跌家数
     */
    downCount: number;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：游资名录
 *
 * @description 接口路径：/basic/active-funds/list
 * @description 接口分组：基础数据
 */
export namespace NSGetBasicActiveFundsList {
  export type IRes = {
    /**
     * 游资名称
     */
    name: string;
    /**
     * 关联机构
     */
    orgs: string[];
    /**
     * 说明
     */
    desc: string;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：每日交易数据
 *
 * @description 接口路径：/basic/daily/list
 * @description 接口分组：基础数据
 */
export namespace NSGetBasicDailyList {
  export interface IParams {
    /**
     * pageNum
     */
    pageNum: number;
    /**
     * pageSize
     */
    pageSize: number;
    /**
     * orderField
     */
    orderField: string;
    /**
     * order
     */
    order: string;
    /**
     * 开始时间
     */
    startDate: string;
    /**
     * 结束时间
     */
    endDate: string;
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 股票代码（包含交易所）
     */
    tsCode: string;
    /**
     * 股票名称
     */
    name: string;
    /**
     * 过滤字段
     */
    fields: array;
  }
  export interface IRes {
    items: {
      /**
       * 股票代码（包含交易所）
       */
      tsCode: string;
      /**
       * 股票名称
       */
      name: string;
      /**
       * 交易日期
       */
      tradeDate: string;
      /**
       * 涨停价(元)
       */
      upLimit: string;
      /**
       * 跌停价(元)
       */
      downLimit: string;
      /**
       * 开盘价(元)
       */
      open: string;
      /**
       * 最高价(元)
       */
      high: string;
      /**
       * 最低价(元)
       */
      low: string;
      /**
       * 收盘价(元)
       */
      close: string;
      /**
       * 昨收价(元)
       */
      preClose: string;
      /**
       * 涨跌额(元)
       */
      change: string;
      /**
       * 涨跌幅(%)
       */
      pctChg: string;
      /**
       * 成交量(手)
       */
      vol: string;
      /**
       * 成交额(千元)
       */
      amount: string;
      /**
       * 换手率(%)
       */
      turnoverRate: string;
      /**
       * 换手率(自由流通股)(%)
       */
      turnoverRateF: string;
      /**
       * 量比
       */
      volumeRatio: string;
      /**
       * 市盈率(总市值/总利润)
       */
      pe: string;
      /**
       * 市盈率(TTM)
       */
      peTtm: string;
      /**
       * 市净率(总市值/净资产)
       */
      pb: string;
      /**
       * 市销率
       */
      ps: string;
      /**
       * 市销率(TTM)
       */
      psTtm: string;
      /**
       * 股息率(%)
       */
      dvRatio: string;
      /**
       * 股息率(TTM)(%)
       */
      dvTtm: string;
      /**
       * 总股本(万股)
       */
      totalShare: string;
      /**
       * 流通股本(万股)
       */
      floatShare: string;
      /**
       * 自由流通股本(万股)
       */
      freeShare: string;
      /**
       * 总市值(万元)
       */
      totalMv: string;
      /**
       * 流通市值(万元)
       */
      circMv: string;
      [k: string]: any;
    }[];
    meta: {
      itemCount: number;
      totalItems: number;
      itemsPerPage: number;
      totalPages: number;
      currentPage: number;
      [k: string]: any;
    };
    [k: string]: any;
  }
}
/**
 * 类型名称：股票基础信息
 *
 * @description 接口路径：/basic/stock/list
 * @description 接口分组：基础数据
 */
export namespace NSGetBasicStockList {
  export interface IParams {
    /**
     * pageNum
     */
    pageNum: number;
    /**
     * pageSize
     */
    pageSize: number;
    /**
     * orderField
     */
    orderField: string;
    /**
     * order
     */
    order: string;
    /**
     * 股票代码（包含交易所）
     */
    tsCode: string;
    /**
     * 股票名称
     */
    name: string;
    /**
     * 市场类型
     */
    market: string;
    /**
     * 上市状态
     */
    listStatus: string;
    /**
     * 是否沪深港通标的
     */
    isHs: string;
  }
  export interface IRes {
    items: {
      /**
       * 股票代码（包含交易所）
       */
      tsCode: string;
      /**
       * 股票代码
       */
      symbol: string;
      /**
       * 股票名称
       */
      name: string;
      /**
       * 所在区域
       */
      area: string;
      /**
       * 所在行业
       */
      industry: string;
      /**
       * 股票全称
       */
      fullname: string;
      /**
       * 英文全称
       */
      enname: string;
      /**
       * 拼音缩写
       */
      cnspell: string;
      /**
       * 市场类型（主板/创业板/科创板/北交所）
       */
      market: string;
      /**
       * 交易所代码
       */
      exchange: string;
      /**
       * 交易货币
       */
      currType: string;
      /**
       * 上市状态（L上市中 D已退市 P暂停上市）
       */
      listStatus: string;
      /**
       * 上市日期
       */
      listDate: string;
      /**
       * 退市日期
       */
      delistDate: string;
      /**
       * 是否沪深港通标的，N否 H沪股通 S深股通
       */
      isHs: string;
      /**
       * 实控人名称
       */
      actName: string;
      /**
       * 实控人企业性质
       */
      actEntType: string;
      [k: string]: any;
    }[];
    meta: {
      itemCount: number;
      totalItems: number;
      itemsPerPage: number;
      totalPages: number;
      currentPage: number;
      [k: string]: any;
    };
    [k: string]: any;
  }
}
/**
 * 类型名称：交易日历
 *
 * @description 接口路径：/basic/trade-cal/list
 * @description 接口分组：基础数据
 */
export namespace NSGetBasicTradeCalList {
  export interface IParams {
    /**
     * 年份
     */
    year: string;
  }
  export type IRes = {
    /**
     * 日期
     */
    calDate: string;
    /**
     * 是否为交易日期 0: 否 1: 是
     */
    isOpen: number;
    /**
     * 上一个交易日期
     */
    preTradeDate: string;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：所有选项
 *
 * @description 接口路径：/common/all-options
 * @description 接口分组：公共数据
 */
export namespace NSGetCommonAllOptions {
  export interface IRes {
    key: string[];
    [k: string]: any;
  }
}
/**
 * 类型名称：策略选股结果列表
 *
 * @description 接口路径：/strategy/list
 * @description 接口分组：策略选股
 */
export namespace NSGetStrategyList {
  export interface IParams {
    /**
     * 日期
     */
    date: string;
    /**
     * 策略类型
     */
    strategyType: string;
  }
  export type IRes = {
    /**
     * 股票代码（包含交易所）
     */
    tsCode: string;
    /**
     * 股票名称
     */
    name: string;
    /**
     * 交易日期
     */
    tradeDate: string;
    /**
     * 涨停价(元)
     */
    upLimit: string;
    /**
     * 跌停价(元)
     */
    downLimit: string;
    /**
     * 开盘价(元)
     */
    open: string;
    /**
     * 最高价(元)
     */
    high: string;
    /**
     * 最低价(元)
     */
    low: string;
    /**
     * 收盘价(元)
     */
    close: string;
    /**
     * 昨收价(元)
     */
    preClose: string;
    /**
     * 涨跌额(元)
     */
    change: string;
    /**
     * 涨跌幅(%)
     */
    pctChg: string;
    /**
     * 成交量(手)
     */
    vol: string;
    /**
     * 成交额(千元)
     */
    amount: string;
    /**
     * 换手率(%)
     */
    turnoverRate: string;
    /**
     * 换手率(自由流通股)(%)
     */
    turnoverRateF: string;
    /**
     * 量比
     */
    volumeRatio: string;
    /**
     * 市盈率(总市值/总利润)
     */
    pe: string;
    /**
     * 市盈率(TTM)
     */
    peTtm: string;
    /**
     * 市净率(总市值/净资产)
     */
    pb: string;
    /**
     * 市销率
     */
    ps: string;
    /**
     * 市销率(TTM)
     */
    psTtm: string;
    /**
     * 股息率(%)
     */
    dvRatio: string;
    /**
     * 股息率(TTM)(%)
     */
    dvTtm: string;
    /**
     * 总股本(万股)
     */
    totalShare: string;
    /**
     * 流通股本(万股)
     */
    floatShare: string;
    /**
     * 自由流通股本(万股)
     */
    freeShare: string;
    /**
     * 总市值(万元)
     */
    totalMv: string;
    /**
     * 流通市值(万元)
     */
    circMv: string;
    [k: string]: any;
  }[];
}
/**
 * 类型名称：策略名称列表
 *
 * @description 接口路径：/strategy/tabs-list
 * @description 接口分组：策略选股
 */
export namespace NSGetStrategyTabsList {
  export type IRes = {
    label: string;
    key: string;
    [k: string]: any;
  }[];
}
