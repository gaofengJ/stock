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
     * 数据分析
     */
    '/api/analysis/chains/count-limit-up-times', // n 连板数量统计
    '/api/analysis/limits/limit-up-list', // 涨停板复盘
    /**
     * 基础数据
     */
    '/api/basic/daily/list', // 每日交易数据
    '/api/basic/stock/list', // 股票基本信息
  ],
});
