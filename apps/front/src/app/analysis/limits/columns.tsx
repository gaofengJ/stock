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
    width: 80,
    render: (val) => val.split('.')[0],
  },
  {
    title: '股票名称',
    dataIndex: 'name',
    key: 'name',
    width: 80,
  },
  {
    title: '所属行业',
    dataIndex: 'industry',
    key: 'industry',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '涨跌幅(%)',
    dataIndex: 'pctChg',
    key: 'pctChg',
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
    title: '成交额(亿元)',
    dataIndex: 'amount',
    key: 'amount',
    width: 96,
    render: (val) => (val / 100000000).toFixed(2),
  },
  {
    title: '流通市值(亿元)',
    dataIndex: 'floatMv',
    key: 'floatMv',
    width: 104,
    render: (val) => (val / 100000000).toFixed(2),
  },
  {
    title: '换手率(%)',
    dataIndex: 'turnoverRatio',
    key: 'turnoverRatio',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '最后封板时间',
    dataIndex: 'lastTime',
    key: 'lastTime',
    width: 104,
    render: renderEmptyField,
  },
  {
    title: '打开次数',
    dataIndex: 'openTimes',
    key: 'openTimes',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '连板数',
    dataIndex: 'limitTimes',
    key: 'limitTimes',
    width: 80,
    render: renderEmptyField,
  },
  {
    title: '涨停统计',
    dataIndex: 'upStat',
    key: 'upStat',
    width: 80,
    render: (val) => {
      const [limits, days] = val.split('/');
      return `${days}天${limits}板`;
    },
  },
];
