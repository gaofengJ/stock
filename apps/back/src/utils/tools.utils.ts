import { zipObject, keyBy, merge } from 'lodash';
import { EType } from '@/types/common.enum';

/**
 * @description 获取值的类型
 * @param value 要获取类型的值
 * @returns 值的类型字符串
 */
export const getType = (value: unknown): string => {
  const rawType = Object.prototype.toString.call(value);
  const typeStr = rawType.slice(8, -1).toLowerCase();
  return EType[typeStr as keyof typeof EType];
};

/**
 * 合并字段名和数据
 * @param fields 字段数组
 * @param items 数据
 */
export const mixinFieldAndItems = (fields: string[], items: any[]): any[] => {
  if (!fields.length || !items.length) return [];
  if (!Array.isArray(items[0]) || !items[0].length) return [];
  return items.map((item) => zipObject(fields, item));
};

/**
 * 合并 daily 相关的三类数据
 */
export const mixinDailyParams = (
  dailyParams: any[],
  limitParams: any[],
  basicParams: any[],
) => {
  if (!dailyParams.length || !limitParams.length || !basicParams.length) {
    return [];
  }
  const dailyObj = keyBy(
    dailyParams,
    (item) => `${item.tradeDate}${item.tsCode}`,
  );
  const limitObj = keyBy(
    limitParams,
    (item) => `${item.tradeDate}${item.tsCode}`,
  );
  const basicObj = keyBy(
    basicParams,
    (item) => `${item.tradeDate}${item.tsCode}`,
  );
  const mergedObj = merge(dailyObj, limitObj, basicObj);
  return Object.values(mergedObj).filter(
    (item) => item.upLimit && item.downLimit,
  );
};
