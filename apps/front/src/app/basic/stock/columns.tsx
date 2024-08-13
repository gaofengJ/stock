import type { ColumnsType } from 'antd/es/table/interface';
import { useOptionsState } from '@/store/useOptionsStore';

/**
 * 设置默认值
 */
const renderEmptyField = (val: any) => (val || '-');

export const useStockColumns = (): ColumnsType => {
  const { allOptions } = useOptionsState();
  return [
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
      render: renderEmptyField,
    },
    {
      title: '所在行业',
      dataIndex: 'industry',
      key: 'industry',
      render: renderEmptyField,
    },
    {
      title: '所在区域',
      dataIndex: 'area',
      key: 'area',
      render: renderEmptyField,
    },
    {
      title: '市场类型',
      dataIndex: 'market',
      key: 'market',
      render: renderEmptyField,
    },
    {
      title: '上市状态',
      dataIndex: 'listStatus',
      key: 'listStatus',
      render: (val) => {
        const options = allOptions.listStatus || [];
        return options.find((i) => i.value === val)?.label;
      },
    },
    {
      title: '上市日期',
      dataIndex: 'listDate',
      key: 'listDate',
      render: renderEmptyField,
    },
    {
      title: '是否沪深港通标的',
      dataIndex: 'isHs',
      key: 'isHs',
      ellipsis: true,
      render: (val) => {
        const options = allOptions.isHs || [];
        return options.find((i) => i.value === val)?.label;
      },
    },
    {
      title: '实控人名称',
      dataIndex: 'actName',
      key: 'actName',
      ellipsis: true,
      render: renderEmptyField,
    },
    {
      title: '实控人企业性质',
      dataIndex: 'actEntType',
      key: 'actEntType',
      ellipsis: true,
      render: renderEmptyField,
    },
  ];
};
