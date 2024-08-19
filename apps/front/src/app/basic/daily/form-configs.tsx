import { DatePicker, Input } from 'antd';
import { IFormItemProps } from '@/types/common.type';

/**
 * 每日交易数据筛选项
 */
export const useStockFilterConfigs = (): IFormItemProps[] => [
  {
    component: (<DatePicker />),
    name: 'tradeDate',
    label: '交易日期',
    attrs: {
      placeholder: '交易日期',
      format: 'YYYY-MM-DD',
      allowClear: false,
      style: {
        width: 128,
      },
    },
  },
  {
    component: (<Input />),
    name: 'tsCode',
    label: '股票代码',
    attrs: {
      placeholder: '股票代码',
      allowClear: true,
      style: {
        width: 120,
      },
    },
  },
  {
    component: (<Input />),
    name: 'name',
    label: '股票名称',
    attrs: {
      placeholder: '股票名称',
      allowClear: true,
      style: {
        width: 120,
      },
    },
  },
];
