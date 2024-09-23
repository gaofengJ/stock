import { DatePicker } from 'antd';
import { Dayjs } from 'dayjs';

import { IFormItemProps } from '@/types/common.type';

/**
 * 交易日历筛选项
 */
export const useTradeCalConfigs = (): IFormItemProps[] => [
  {
    component: (<DatePicker />),
    name: 'year',
    label: '年份',
    attrs: {
      picker: 'year',
      placeholder: '年份',
      format: 'YYYY',
      allowClear: false,
      // 禁用 2020 年以前的年份
      disabledDate: (current: Dayjs) => current && current.year() < 2020,
      style: {
        width: 128,
      },
    },
  },
];
