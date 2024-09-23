import { useCallback } from 'react';

import { useOptionsState } from '@/store/useOptionsStore';
import { IOption } from '@/types/common.type';

/**
 * 自定义 Hook：通过 key 获取 allOptions 中的特定选项
 * @param key 要获取的选项的键
 * @returns IOption[] 或者 undefined
 */
export const useOptionByKey = (key: string): IOption[] | undefined => {
  const allOptions = useOptionsState((state) => state.allOptions);

  // 使用 useCallback 确保返回的选项在 allOptions 不变时保持不变
  const getOptionByKey = useCallback(() => allOptions[key], [allOptions, key]);

  return getOptionByKey();
};
