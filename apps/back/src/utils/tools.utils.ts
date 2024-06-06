import { EType } from '@/types/common.enum';

/**
 * 获取值的类型
 * @param value 要获取类型的值
 * @returns 值的类型字符串
 */
export const getType = (value: unknown): string => {
  const rawType = Object.prototype.toString.call(value);
  const typeStr = rawType.slice(8, -1).toLowerCase();
  return EType[typeStr as keyof typeof EType];
};
