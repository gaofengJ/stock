/* eslint-disable */
/**
 * This file is automatically generated by swagger-to-ts. Do not modify it manually.
 */

import axios from './request';
import type { RequestConfig } from './types';
import type {
  NSGetAnalysisChainsCountLimitUpAboveTimes,
  NSGetAnalysisChainsCountLimitUpTimes,
  NSGetAnalysisChainsLimitUpAmount,
  NSGetAnalysisChainsUpgradeLimitUpAmount,
  NSGetAnalysisChainsUpgradeLimitUpRates,
  NSGetAnalysisLimitsLimitUpList,
  NSGetAnalysisSentiDistributionTatistics,
  NSGetBasicDailyList,
  NSGetBasicStockList,
  NSGetCommonAllOptions,
} from './services.types.ts';
/**
 * 接口名称：n+连板数量统计
 *
 * @description 接口路径：/analysis/chains/count-limit-up-above-times
 * @description 接口分组：数据分析
 */
export const getAnalysisChainsCountLimitUpAboveTimes = (
  params: NSGetAnalysisChainsCountLimitUpAboveTimes.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisChainsCountLimitUpAboveTimes.IRes>(
    '/analysis/chains/count-limit-up-above-times',
    { params, ...config },
  );
/**
 * 接口名称：n连板数量统计
 *
 * @description 接口路径：/analysis/chains/count-limit-up-times
 * @description 接口分组：数据分析
 */
export const getAnalysisChainsCountLimitUpTimes = (
  params: NSGetAnalysisChainsCountLimitUpTimes.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisChainsCountLimitUpTimes.IRes>('/analysis/chains/count-limit-up-times', {
    params,
    ...config,
  });
/**
 * 接口名称：涨停参与金额
 *
 * @description 接口路径：/analysis/chains/limit-up-amount
 * @description 接口分组：数据分析
 */
export const getAnalysisChainsLimitUpAmount = (
  params: NSGetAnalysisChainsLimitUpAmount.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisChainsLimitUpAmount.IRes>('/analysis/chains/limit-up-amount', {
    params,
    ...config,
  });
/**
 * 接口名称：连板参与金额
 *
 * @description 接口路径：/analysis/chains/upgrade-limit-up-amount
 * @description 接口分组：数据分析
 */
export const getAnalysisChainsUpgradeLimitUpAmount = (
  params: NSGetAnalysisChainsUpgradeLimitUpAmount.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisChainsUpgradeLimitUpAmount.IRes>(
    '/analysis/chains/upgrade-limit-up-amount',
    { params, ...config },
  );
/**
 * 接口名称：n连板晋级成功率
 *
 * @description 接口路径：/analysis/chains/upgrade-limit-up-rates
 * @description 接口分组：数据分析
 */
export const getAnalysisChainsUpgradeLimitUpRates = (
  params: NSGetAnalysisChainsUpgradeLimitUpRates.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisChainsUpgradeLimitUpRates.IRes>(
    '/analysis/chains/upgrade-limit-up-rates',
    { params, ...config },
  );
/**
 * 接口名称：涨停板复盘
 *
 * @description 接口路径：/analysis/limits/limit-up-list
 * @description 接口分组：数据分析
 */
export const getAnalysisLimitsLimitUpList = (
  params: NSGetAnalysisLimitsLimitUpList.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisLimitsLimitUpList.IRes>('/analysis/limits/limit-up-list', {
    params,
    ...config,
  });
/**
 * 接口名称：涨跌分布统计
 *
 * @description 接口路径：/analysis/senti/distribution-tatistics
 * @description 接口分组：数据分析
 */
export const getAnalysisSentiDistributionTatistics = (
  params: NSGetAnalysisSentiDistributionTatistics.IParams,
  config: RequestConfig = {},
) =>
  axios.get<NSGetAnalysisSentiDistributionTatistics.IRes>(
    '/analysis/senti/distribution-tatistics',
    { params, ...config },
  );
/**
 * 接口名称：每日交易数据
 *
 * @description 接口路径：/basic/daily/list
 * @description 接口分组：基础数据
 */
export const getBasicDailyList = (
  params: NSGetBasicDailyList.IParams,
  config: RequestConfig = {},
) => axios.get<NSGetBasicDailyList.IRes>('/basic/daily/list', { params, ...config });
/**
 * 接口名称：股票基础信息
 *
 * @description 接口路径：/basic/stock/list
 * @description 接口分组：基础数据
 */
export const getBasicStockList = (
  params: NSGetBasicStockList.IParams,
  config: RequestConfig = {},
) => axios.get<NSGetBasicStockList.IRes>('/basic/stock/list', { params, ...config });
/**
 * 接口名称：所有选项
 *
 * @description 接口路径：/common/all-options
 * @description 接口分组：公共数据
 */
export const getCommonAllOptions = (config: RequestConfig = {}) =>
  axios.get<NSGetCommonAllOptions.IRes>('/common/all-options');
