import { DatePicker } from 'antd';
import { IFormItemProps } from '@/types/common.type';

const { RangePicker } = DatePicker;

/**
 * 单日搜索筛选项
 */
export const useSingleDayFilterConfigs = (): IFormItemProps[] => [
  {
    component: (<DatePicker />),
    name: 'tradeDate',
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

/**
 * 日期范围筛选项
 */
export const useDateRangeFilterConfigs = (): IFormItemProps[] => [
  {
    component: (<RangePicker />),
    name: 'dateRange',
    label: '起止时间',
    attrs: {
      placeholder: '请选择',
      format: 'YYYY-MM-DD',
      allowClear: false,
      style: {
        width: 240,
      },
    },
  },
];
