import type { ColumnsType } from 'antd/es/table/interface';

/**
 * 设置默认值
 */
const renderEmptyField = (val: any) => (val || '-');

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
    title: '涨停价(元)',
    dataIndex: 'upLimit',
    key: 'upLimit',
    render: renderEmptyField,
  },
  {
    title: '跌停价(元)',
    dataIndex: 'downLimit',
    key: 'downLimit',
    render: renderEmptyField,
  },
  {
    title: '开盘价(元)',
    dataIndex: 'open',
    key: 'open',
    render: renderEmptyField,
  },
  {
    title: '最高价(元)',
    dataIndex: 'high',
    key: 'high',
    render: renderEmptyField,
  },
  {
    title: '最低价(元)',
    dataIndex: 'low',
    key: 'low',
    render: renderEmptyField,
  },
  {
    title: '收盘价(元)',
    dataIndex: 'close',
    key: 'close',
    render: renderEmptyField,
  },
  {
    title: '昨收价(元)',
    dataIndex: 'preClose',
    key: 'preClose',
    render: renderEmptyField,
  },
  {
    title: '涨跌额(元)',
    dataIndex: 'change',
    key: 'change',
    render: renderEmptyField,
  },
  {
    title: '涨跌幅(%)',
    dataIndex: 'pctChg',
    key: 'pctChg',
    render: renderEmptyField,
  },
  {
    title: '成交量(手)',
    dataIndex: 'vol',
    key: 'vol',
    render: renderEmptyField,
  },
  {
    title: '成交额(万元)',
    dataIndex: 'amount',
    key: 'amount',
    render: (val) => ((val / 10).toFixed(2)),
  },
  {
    title: '换手率(%)',
    dataIndex: 'turnoverRate',
    key: 'turnoverRate',
    render: renderEmptyField,
  },
  {
    title: '换手率(自由流通股)(%)',
    dataIndex: 'turnoverRateF',
    key: 'turnoverRateF',
    ellipsis: true,
    render: renderEmptyField,
  },
  {
    title: '量比',
    dataIndex: 'volumeRatio',
    key: 'volumeRatio',
    render: renderEmptyField,
  },
  {
    title: '市盈率(总市值/总利润)',
    dataIndex: 'pe',
    key: 'pe',
    ellipsis: true,
    render: renderEmptyField,
  },
  {
    title: '市盈率(TTM)',
    dataIndex: 'peTtm',
    key: 'peTtm',
    render: renderEmptyField,
  },
  {
    title: '市净率(总市值/净资产)',
    dataIndex: 'pb',
    key: 'pb',
    ellipsis: true,
    render: renderEmptyField,
  },
  {
    title: '市销率',
    dataIndex: 'ps',
    key: 'ps',
    render: renderEmptyField,
  },
  {
    title: '市销率(TTM)',
    dataIndex: 'psTtm',
    key: 'psTtm',
    render: renderEmptyField,
  },
  {
    title: '股息率(%)',
    dataIndex: 'dvRatio',
    key: 'dvRatio',
    render: renderEmptyField,
  },
  {
    title: '股息率(TTM)(%)',
    dataIndex: 'dvTtm',
    key: 'dvTtm',
    ellipsis: true,
    render: renderEmptyField,
  },
  {
    title: '总股本(万股)',
    dataIndex: 'totalShare',
    key: 'totalShare',
    render: renderEmptyField,
  },
  {
    title: '流通股本(万股)',
    dataIndex: 'floatShare',
    key: 'floatShare',
    render: renderEmptyField,
  },
  {
    title: '自由流通股本(万股)',
    dataIndex: 'freeShare',
    key: 'freeShare',
    ellipsis: true,
    render: renderEmptyField,
  },
  {
    title: '总市值(亿元)',
    dataIndex: 'totalMv',
    key: 'totalMv',
    render: (val) => (val / 10000).toFixed(2),
  },
  {
    title: '流通市值(亿元)',
    dataIndex: 'circMv',
    key: 'circMv',
    render: (val) => (val / 10000).toFixed(2),
  },
];
