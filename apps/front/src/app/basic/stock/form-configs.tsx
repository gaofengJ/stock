import { Input, Select } from 'antd';

import { useOptionsState } from '@/store/useOptionsStore';
import { IFormItemProps } from '@/types/common.type';

/**
 * 股票基本信息筛选项
 */
export const useStockFilterConfigs = (): IFormItemProps[] => {
  const { allOptions } = useOptionsState();

  return [
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
    {
      component: (<Select />),
      name: 'market',
      label: '市场类型',
      attrs: {
        options: allOptions.marketTypes || [],
        placeholder: '市场类型',
        allowClear: true,
        style: {
          width: 120,
        },
      },
    },
    {
      component: (<Select />),
      name: 'listStatus',
      label: '上市状态',
      attrs: {
        options: allOptions.listStatus || [],
        placeholder: '上市状态',
        allowClear: true,
        style: {
          width: 120,
        },
      },
    },
    {
      component: (<Select />),
      name: 'isHs',
      label: '沪深港通',
      attrs: {
        options: allOptions.isHs || [],
        placeholder: '沪深港通',
        allowClear: true,
        style: {
          width: 120,
        },
      },
    },
  ];
};
