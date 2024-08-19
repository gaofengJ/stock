import { DatePicker } from 'antd';
import { IFormItemProps } from '@/types/common.type';

const { RangePicker } = DatePicker;

/**
 * 连板统计筛选项
 */
export const useLimitsFilterConfigs = (): IFormItemProps[] => [
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
