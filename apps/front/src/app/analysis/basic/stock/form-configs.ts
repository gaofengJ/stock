import { IFormItemProps } from '@/types/common.type';

/**
 * 股票基本信息筛选项
 */
export const stockFilterConfigs: IFormItemProps[] = [
  {
    type: 'a-input',
    name: 'tsCode',
    attrs: {
      placeholder: '请输入股票代码',
      allowClear: true,
    },
  },
  {
    type: 'a-input',
    name: 'name',
    attrs: {
      placeholder: '请输入股票名称',
      allowClear: true,
    },
  },
];
