import dayjs from 'dayjs';

/**
 * 获取当年的最后一个周五
 * @param year 年份
 * @returns
 */
export const getLastFridayOfYear = (year: number): string => {
  // 获取当年的最后一天
  let lastDay = dayjs(`${year}-12-31`);

  // 向前查找最后一个周五
  while (lastDay.day() !== 5) {
    lastDay = lastDay.subtract(1, 'day');
  }

  return lastDay.format('YYYY-MM-DD');
};
