import type { ColumnsType } from 'antd/es/table/interface';

/**
 * 设置默认值
 */
const handleEmptyField = (val: any) => (val || '-');

export const dailyColumns: ColumnsType = [
  {
    title: '股票代码',
    dataIndex: 'tsCode',
    key: 'tsCode',
    fixed: 'left',
    width: 120,
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
    fixed: 'left',
    width: 120,
  },
  {
    title: '交易日期',
    dataIndex: 'tradeDate',
    key: 'tradeDate',
    fixed: 'left',
    width: 120,
  },
  {
    title: '涨停价',
    dataIndex: 'upLimit',
    key: 'upLimit',
    render: handleEmptyField,
  },
  {
    title: '跌停价',
    dataIndex: 'downLimit',
    key: 'downLimit',
    render: handleEmptyField,
  },
  {
    title: '开盘价',
    dataIndex: 'open',
    key: 'open',
    render: handleEmptyField,
  },
  {
    title: '最高价',
    dataIndex: 'high',
    key: 'high',
    render: handleEmptyField,
  },
  {
    title: '最低价',
    dataIndex: 'low',
    key: 'low',
    render: handleEmptyField,
  },
  {
    title: '收盘价',
    dataIndex: 'close',
    key: 'close',
    render: handleEmptyField,
  },
  {
    title: '昨收价',
    dataIndex: 'preClose',
    key: 'preClose',
    render: handleEmptyField,
  },
  {
    title: '涨跌额',
    dataIndex: 'change',
    key: 'change',
    render: handleEmptyField,
  },
  {
    title: '涨跌幅',
    dataIndex: 'pctChg',
    key: 'pctChg',
    render: handleEmptyField,
  },
  {
    title: '成交量（手）',
    dataIndex: 'vol',
    key: 'vol',
    render: handleEmptyField,
  },
  {
    title: '成交额（万元）',
    dataIndex: 'amount',
    key: 'amount',
    render: handleEmptyField,
  },
  {
    title: '换手率',
    dataIndex: 'turnoverRate',
    key: 'turnoverRate',
    render: handleEmptyField,
  },
  {
    title: '换手率（自由流通股）',
    dataIndex: 'turnoverRateF',
    key: 'turnoverRateF',
    render: handleEmptyField,
  },
  {
    title: '量比',
    dataIndex: 'volumeRatio',
    key: 'volumeRatio',
    render: handleEmptyField,
  },
  {
    title: '市盈率（总市值/总利润）',
    dataIndex: 'pe',
    key: 'pe',
    render: handleEmptyField,
  },
  {
    title: '市盈率（TTM）',
    dataIndex: 'peTtm',
    key: 'peTtm',
    render: handleEmptyField,
  },
  {
    title: '市净率（总市值/净资产）',
    dataIndex: 'pb',
    key: 'pb',
    render: handleEmptyField,
  },
  {
    title: '市销率',
    dataIndex: 'ps',
    key: 'ps',
    render: handleEmptyField,
  },
  {
    title: '市销率（TTM）',
    dataIndex: 'psTtm',
    key: 'psTtm',
    render: handleEmptyField,
  },
  {
    title: '股息率（%）',
    dataIndex: 'dvRatio',
    key: 'dvRatio',
    render: handleEmptyField,
  },
  {
    title: '股息率（TTM）（%）',
    dataIndex: 'dvTtm',
    key: 'dvTtm',
    render: handleEmptyField,
  },
  {
    title: '总股本（万股）',
    dataIndex: 'totalShare',
    key: 'totalShare',
    render: handleEmptyField,
  },
  {
    title: '流通股本（万股）',
    dataIndex: 'floatShare',
    key: 'floatShare',
    render: handleEmptyField,
  },
  {
    title: '自由流通股本（万股）',
    dataIndex: 'freeShare',
    key: 'freeShare',
    render: handleEmptyField,
  },
  {
    title: '总市值（万元）',
    dataIndex: 'totalMv',
    key: 'totalMv',
    render: handleEmptyField,
  },
  {
    title: '流通市值（万元）',
    dataIndex: 'circMv',
    key: 'circMv',
    render: handleEmptyField,
  },
];
