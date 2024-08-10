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
  /**
   * 市场类型
   */
  marketTypes: [
    {
      label: '主板',
      value: '主板',
    },
    {
      label: '中小板',
      value: '中小板',
    },
    {
      label: '创业板',
      value: '创业板',
    },
    {
      label: '科创板',
      value: '科创板',
    },
    {
      label: '北交所',
      value: '北交所',
    },
  ],
  /**
   * 上市状态
   */
  listStatus: [
    {
      label: '上市中',
      value: 'L',
    },
    {
      label: '已退市',
      value: 'D',
    },
    {
      label: '暂停上市',
      value: 'P',
    },
  ],
  /**
   * 是否沪深港通标的
   */
  isHs: [
    {
      label: '否',
      value: 'N',
    },
    {
      label: '沪股通',
      value: 'H',
    },
    {
      label: '深股通',
      value: 'S',
    },
  ],
};
