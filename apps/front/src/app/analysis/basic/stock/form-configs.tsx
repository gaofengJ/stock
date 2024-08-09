import { Input } from 'antd';
import { IFormItemProps } from '@/types/common.type';

/**
 * 股票基本信息筛选项
 */
export const stockFilterConfigs: IFormItemProps[] = [
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
