/**
 * 响应成功错误码
 */
export const RESPONSE_SUCCESS_CODE = 0;

/**
 * 响应成功message
 */
export const RESPONSE_SUCCESS_MSG = 'success';

/**
 * 用作装饰器的键，用于在元数据中存储任务标记
 */
export const MISSION_DECORATOR_KEY = 'decorator:mission';

/**
 * 自定义异常错误码
 */
export enum EError {
  /**
   * 默认异常
   */
  DEFAULT_ERROR = '500',
  /**
   * 用户模块-用户不存在
   */
  USER_NOT_FOUND = '1001',
  /**
   * 数据相关-非交易日期
   */
  NON_TRADING_DAY = '2001',
  /**
   * 数据相关-导入交易日历失败
   */
  IMPORT_TRADE_CAL_FAILED = '2002',
  /**
   * 数据相关-导入股票基本信息失败
   */
  IMPORT_STOCK_FAILED = '2003',
  /**
   * 数据相关-导入每日数据失败
   */
  IMPORT_DAILY_FAILED = '2004',
  /**
   * 数据相关-导入涨跌停数据失败
   */
  IMPORT_LIMIT_FAILED = '2005',
}
