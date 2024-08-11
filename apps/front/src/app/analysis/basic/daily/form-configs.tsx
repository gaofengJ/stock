import { DatePicker } from 'antd';
import { IFormItemProps } from '@/types/common.type';

/**
 * 股票基本信息筛选项
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
        width: 120,
      },
    },
  },
];
