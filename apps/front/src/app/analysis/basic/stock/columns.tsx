import type { ColumnsType } from 'antd/es/table/interface';

/**
 * 设置默认值
 */
const handleEmptyField = (val: any) => (val || '-');

export const stockColumns: ColumnsType = [
  {
    title: '股票代码',
    dataIndex: 'symbol',
    key: 'symbol',
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
    title: '股票全称',
    dataIndex: 'fullname',
    key: 'fullname',
    ellipsis: true,
    render: handleEmptyField,
  },
  {
    title: '所在行业',
    dataIndex: 'industry',
    key: 'industry',
    render: handleEmptyField,
  },
  {
    title: '所在区域',
    dataIndex: 'area',
    key: 'area',
    render: handleEmptyField,
  },
  {
    title: '市场类型',
    dataIndex: 'market',
    key: 'market',
    render: handleEmptyField,
  },
  {
    title: '上市状态',
    dataIndex: 'listStatus',
    key: 'listStatus',
    render: handleEmptyField,
  },
  {
    title: '上市日期',
    dataIndex: 'listDate',
    key: 'listDate',
    render: handleEmptyField,
  },
  {
    title: '是否沪深港通标的',
    dataIndex: 'isHs',
    key: 'isHs',
    render: handleEmptyField,
  },
  {
    title: '实控人名称',
    dataIndex: 'actName',
    key: 'actName',
    render: handleEmptyField,
  },
  {
    title: '实控人企业性质',
    dataIndex: 'actEntType',
    key: 'actEntType',
    render: handleEmptyField,
  },
];
