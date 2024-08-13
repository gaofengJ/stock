import type { ColumnsType } from 'antd/es/table/interface';

/**
 * 设置默认值
 */
const renderEmptyField = (val: any) => (val || '-');

export const limitsColumns: ColumnsType = [
  {
    title: '股票代码',
    dataIndex: 'tsCode',
    key: 'tsCode',
    render: (val) => val.split('.')[0],
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
  },
  {
    title: '所属行业',
    dataIndex: 'industry',
    key: 'industry',
    render: renderEmptyField,
  },
  {
    title: '涨跌幅(%)',
    dataIndex: 'pctChg',
    key: 'pctChg',
    render: renderEmptyField,
  },
  {
    title: '收盘价(元)',
    dataIndex: 'close',
    key: 'close',
    render: renderEmptyField,
  },
  {
    title: '成交额(亿元)',
    dataIndex: 'amount',
    key: 'amount',
    render: (val) => (val / 100000000).toFixed(2),
  },
  {
    title: '流通市值(亿元)',
    dataIndex: 'floatMv',
    key: 'floatMv',
    render: (val) => (val / 100000000).toFixed(2),
  },
  {
    title: '换手率(%)',
    dataIndex: 'turnoverRatio',
    key: 'turnoverRatio',
    render: renderEmptyField,
  },
  {
    title: '最后封板时间',
    dataIndex: 'lastTime',
    key: 'lastTime',
    render: renderEmptyField,
  },
  {
    title: '打开次数',
    dataIndex: 'openTimes',
    key: 'openTimes',
    render: renderEmptyField,
  },
  {
    title: '连板数',
    dataIndex: 'limitTimes',
    key: 'limitTimes',
    render: renderEmptyField,
  },
  {
    title: '涨停统计',
    dataIndex: 'upStat',
    key: 'upStat',
    render: renderEmptyField,
  },
];
