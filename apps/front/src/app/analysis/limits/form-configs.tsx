import { DatePicker } from 'antd';
import { IFormItemProps } from '@/types/common.type';

/**
 * 涨停板复盘筛选项
 */
export const useLimitsFilterConfigs = (): IFormItemProps[] => [
  {
    component: (<DatePicker />),
    name: 'date',
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
];
