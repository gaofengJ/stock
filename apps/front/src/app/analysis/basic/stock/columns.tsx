import type { ColumnsType } from 'antd/es/table/interface';

export const stockColumns: ColumnsType = [
  {
    title: '股票代码',
    dataIndex: 'symbol',
    key: 'symbol',
    fixed: 'left',
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
    fixed: 'left',
  },
  {
    title: '股票全称',
    dataIndex: 'fullname',
    key: 'fullname',
    width: 320,
  },
  {
    title: '所在行业',
    dataIndex: 'industry',
    key: 'industry',
  },
  {
    title: '所在区域',
    dataIndex: 'area',
    key: 'area',
  },
  {
    title: '交易所',
    dataIndex: 'market',
    key: 'market',
  },
  {
    title: '上市状态',
    dataIndex: 'listStatus',
    key: 'listStatus',
    // render: (text) => <span>{listStatusMap[text]}</span>,
  },
  {
    title: '上市日期',
    dataIndex: 'listDate',
    key: 'listDate',
  },
  {
    title: '是否为沪深港通',
    dataIndex: 'isHs',
    key: 'isHs',
    width: 136,
    // render: (text) => <span>{isHsMap[text]}</span>,
  },
  {
    title: '开盘价',
    dataIndex: 'open',
    key: 'open',
  },
  {
    title: '最高价',
    dataIndex: 'high',
    key: 'high',
  },
  {
    title: '最低价',
    dataIndex: 'low',
    key: 'low',
  },
  {
    title: '收盘价',
    dataIndex: 'close',
    key: 'close',
  },
  {
    title: '昨收价',
    dataIndex: 'preClose',
    key: 'preClose',
  },
  {
    title: '涨跌额',
    dataIndex: 'change',
    key: 'change',
  },
  {
    title: '涨跌幅',
    dataIndex: 'pctChg',
    key: 'pctChg',
  },
  {
    title: '成交量（手）',
    dataIndex: 'vol',
    key: 'vol',
  },
  {
    title: '成交额（千元）',
    dataIndex: 'amount',
    key: 'amount',
  },
  {
    title: '换手率（%）',
    dataIndex: 'turnoverRate',
    key: 'turnoverRate',
  },
  {
    title: '换手率（自由流通股）（%）',
    dataIndex: 'turnoverRateF',
    key: 'turnoverRateF',
    width: 136,
  },
  {
    title: '量比',
    dataIndex: 'volumeRatio',
    key: 'volumeRatio',
  },
  {
    title: '市盈率（总市值/总利润）（%）',
    dataIndex: 'pe',
    key: 'pe',
    width: 136,
  },
  {
    title: '市盈率（TTM）（%）',
    dataIndex: 'peTtm',
    key: 'peTtm',
    width: 136,
  },
  {
    title: '市净率（总市值/净资产）（%）',
    dataIndex: 'pb',
    key: 'pb',
    width: 136,
  },
  {
    title: '市销率',
    dataIndex: 'ps',
    key: 'ps',
  },
  {
    title: '市销率（TTM）',
    dataIndex: 'psTtm',
    key: 'psTtm',
  },
  {
    title: '股息率（%）',
    dataIndex: 'dvRatio',
    key: 'dvRatio',
  },
  {
    title: '股息率（TTM）（%）',
    dataIndex: 'dvTtm',
    key: 'dvTtm',
    width: 136,
  },
  {
    title: '总股本',
    dataIndex: 'totalShare',
    key: 'totalShare',
  },
  {
    title: '流通股本',
    dataIndex: 'floatShare',
    key: 'floatShare',
  },
  {
    title: '自由流通股本',
    dataIndex: 'freeShare',
    key: 'freeShare',
  },
  {
    title: '总市值',
    dataIndex: 'totalMv',
    key: 'totalMv',
  },
  {
    title: '流通市值',
    dataIndex: 'circMv',
    key: 'circMv',
  },
];
