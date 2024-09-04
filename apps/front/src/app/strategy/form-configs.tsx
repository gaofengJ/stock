import { DatePicker } from 'antd';
import { IFormItemProps } from '@/types/common.type';

/**
 * 单日搜索筛选项
 */
export const useStrategyConfigs = (): IFormItemProps[] => [
  {
    component: (<DatePicker />),
    name: 'date',
    label: '交易日期',
    attrs: {
      placeholder: '请选择',
      format: 'YYYY-MM-DD',
      allowClear: false,
      style: {
        width: 128,
      },
    },
  },
];
