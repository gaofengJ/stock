import { IOption } from '@/types/common.type';

/**
 * 所有选项
 */
export const allOptions: {
  [key: string]: IOption[];
} = {
  /**
   * 是否为交易日期
   */
  isOpen: [
    {
      label: '否',
      value: 0,
    },
    {
      label: '是',
      value: 1,
    },
  ],
};
