/* eslint-disable */
import run from 'mufeng-swagger-to-ts';

run.default({
  docUrl: 'http://127.0.0.1:3000/api-docs-json',
  includePaths: [
    /**
     * 公共数据
     */
    '/api/common/all-options', // 公共数据-所有选项
    /**
     * 数据分析-情绪指标
     */
    '/api/analysis/senti/distribution-tatistics', // 个股涨跌分布统计
    '/api/analysis/senti/up-down-count', // 连日涨跌统计
    '/api/analysis/senti/limit-up-down-count', // 连日涨跌停统计
    '/api/analysis/senti/list', // 查询短线情绪
    /**
     * 数据分析-连板统计
     */
    '/api/analysis/chains/count-limit-up-times', // n 连板数量统计
    '/api/analysis/chains/count-limit-up-above-times', // n+ 连板数量统计
    '/api/analysis/chains/upgrade-limit-up-rates', // 连板晋级成功率
    '/api/analysis/chains/limit-up-amount', // 涨停金额统计
    '/api/analysis/chains/upgrade-limit-up-amount', // 连板金额统计
    /**
     * 数据分析-涨停板复盘
     */
    '/api/analysis/limits/limit-up-list', // 涨停板复盘
    /**
     * 基础数据
     */
    '/api/basic/daily/list', // 每日交易数据
    '/api/basic/stock/list', // 股票基本信息
  ],
});
