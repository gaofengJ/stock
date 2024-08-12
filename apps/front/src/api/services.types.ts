/* eslint-disable */
/**
 * This file is automatically generated by swagger-to-ts. Do not modify it manually.
 */
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
     * 收盘价
     */
    close: string;
    /**
     * 涨跌幅
     */
    pctChg: string;
    /**
     * 成交额（千元）
     */
    amount: string;
    /**
     * 板上成交额（千元）
     */
    limitAmount: string;
    /**
     * 流通市值
     */
    floatMv: string;
    /**
     * 总市值
     */
    totalMv: string;
    /**
     * 换手率
     */
    turnoverRatio: string;
    /**
     * 封单金额
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
     * field
     */
    field: string;
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
       * 涨停价
       */
      upLimit: string;
      /**
       * 跌停价
       */
      downLimit: string;
      /**
       * 开盘价
       */
      open: string;
      /**
       * 最高价
       */
      high: string;
      /**
       * 最低价
       */
      low: string;
      /**
       * 收盘价
       */
      close: string;
      /**
       * 昨收价
       */
      preClose: string;
      /**
       * 涨跌额
       */
      change: string;
      /**
       * 涨跌幅
       */
      pctChg: string;
      /**
       * 成交量（手）
       */
      vol: string;
      /**
       * 成交额（万元）
       */
      amount: string;
      /**
       * 换手率
       */
      turnoverRate: string;
      /**
       * 换手率（自由流通股）
       */
      turnoverRateF: string;
      /**
       * 量比
       */
      volumeRatio: string;
      /**
       * 市盈率（总市值/总利润）
       */
      pe: string;
      /**
       * 市盈率（TTM）
       */
      peTtm: string;
      /**
       * 市净率（总市值/净资产）
       */
      pb: string;
      /**
       * 市销率
       */
      ps: string;
      /**
       * 市销率（TTM）
       */
      psTtm: string;
      /**
       * 股息率（%）
       */
      dvRatio: string;
      /**
       * 股息率（TTM）（%）
       */
      dvTtm: string;
      /**
       * 总股本（万股）
       */
      totalShare: string;
      /**
       * 流通股本（万股）
       */
      floatShare: string;
      /**
       * 自由流通股本（万股）
       */
      freeShare: string;
      /**
       * 总市值（万元）
       */
      totalMv: string;
      /**
       * 流通市值（万元）
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
     * field
     */
    field: string;
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
 * 类型名称：所有选项
 *
 * @description 接口路径：/common/all-options
 * @description 接口分组：公共数据
 */
export namespace NSGetCommonAllOptions {
  export interface IRes {
    [k: string]: any;
  }
}
