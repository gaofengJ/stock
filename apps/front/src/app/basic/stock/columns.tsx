import type { ColumnsType } from 'antd/es/table/interface';
import { useOptionsState } from '@/store/useOptionsStore';
import SectorLinks from '@/components/SectorLinks';
import { StockLink } from '../components/workbench';

/**
 * 设置默认值
 */
const renderEmptyField = (val: any) => (
  val === null || val === undefined || val === '' ? '—' : val
);

export const useStockColumns = (date?: string): ColumnsType => {
  const { allOptions } = useOptionsState();
  return [
    {
      title: '股票代码',
      dataIndex: 'symbol',
      key: 'symbol',
      render: (_, row) => <StockLink code={row.tsCode} date={date} />,
      fixed: 'left',
      width: 120,
    },
    {
      title: '股票名称',
      dataIndex: 'name',
      key: 'name',
      render: (value, row) => <StockLink code={row.tsCode} name={value} date={date} />,
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
      width: 170,
      render: (_, row) => <SectorLinks stock={row} date={date} />,
    },
    {
      title: '所属题材', key: 'topics', width: 240, render: (_, row) => <SectorLinks stock={row} type="N" date={date} />,
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
