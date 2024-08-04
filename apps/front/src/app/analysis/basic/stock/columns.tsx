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
    title: '市场类型',
    dataIndex: 'market',
    key: 'market',
  },
  {
    title: '上市状态',
    dataIndex: 'listStatus',
    key: 'listStatus',
  },
  {
    title: '上市日期',
    dataIndex: 'listDate',
    key: 'listDate',
  },
  {
    title: '是否沪深港通标的',
    dataIndex: 'isHs',
    key: 'isHs',
  },
  {
    title: '实控人名称',
    dataIndex: 'actName',
    key: 'actName',
  },
  {
    title: '实控人企业性质',
    dataIndex: 'actEntType',
    key: 'actEntType',
  },
];
