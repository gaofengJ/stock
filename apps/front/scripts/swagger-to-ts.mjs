/* eslint-disable */
import run from 'mufeng-swagger-to-ts';

run.default({
  docUrl: 'http://127.0.0.1:3000/api-docs-json',
  includePaths: [
    '/api/basic/stock', // 股票基本信息
    '/api/basic/daily', // 每日交易数据
  ],
});
