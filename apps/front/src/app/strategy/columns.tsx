import type { ColumnsType } from 'antd/es/table/interface';

/**
 * 设置默认值
 */
const renderEmptyField = (val: any) => (val || '-');

export const strategyColumns: ColumnsType = [
  {
    title: '股票代码',
    dataIndex: 'tsCode',
    key: 'tsCode',
    width: 80,
    fixed: 'left',
    render: (val) => val.split('.')[0],
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
    width: 80,
  },
  {
    title: '开盘价(元)',
    dataIndex: 'open',
    key: 'open',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '收盘价(元)',
    dataIndex: 'close',
    key: 'close',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '最高价(元)',
    dataIndex: 'high',
    key: 'high',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '最低价(元)',
    dataIndex: 'low',
    key: 'low',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '成交额(亿元)',
    dataIndex: 'amount',
    key: 'amount',
    width: 96,
    render: (val) => (val / 100000).toFixed(2),
  },
  {
    title: '换手率(ttm)(%)',
    dataIndex: 'turnoverRateF',
    key: 'turnoverRateF',
    width: 104,
    render: renderEmptyField,
  },
  {
    title: '量比',
    dataIndex: 'volumeRatio',
    key: 'volumeRatio',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '市盈率(ttm)',
    dataIndex: 'peTtm',
    key: 'peTtm',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '总市值(亿元)',
    dataIndex: 'totalMv',
    key: 'totalMv',
    width: 104,
    render: (val) => (val / 10000).toFixed(2),
  },
  {
    title: '流通市值(亿元)',
    dataIndex: 'circMv',
    key: 'circMv',
    width: 104,
    render: (val) => (val / 10000).toFixed(2),
  },
];
