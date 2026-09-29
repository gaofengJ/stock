import type { MarketStats } from '@/api/market';
import { numberText } from '@/utils/format';

export function promotionTooltip(stats: MarketStats | null, from: number) {
  const promotion = stats?.upgrades.find((item) => item.from === from);
  if (!promotion) return '当日统计数据缺失';
  const cohort = from === 4 ? '四板及以上' : ['', '首板', '二板', '三板'][from];
  if (promotion.denominator === 0) return `昨日${cohort}样本为 0，暂无晋级率`;
  const sample = `晋级 ${promotion.numerator} 只／昨日样本 ${promotion.denominator} 只`;
  return `${promotion.rate == null ? '晋级率数据缺失' : `${numberText(promotion.rate, 2)}%`}（${sample}）`;
}
