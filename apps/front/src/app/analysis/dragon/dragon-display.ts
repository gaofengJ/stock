export type FundingPeriod = 'day' | 'multi' | 'unspecified';
export type FundingFlow = 'all' | 'buy' | 'sell';
export type PeriodFilter = 'all' | FundingPeriod;

export function fundingPeriod(reason: string): FundingPeriod {
  if (/连续.*交易日|多个交易日|(?:三|3)日(?:内|累计)/.test(reason)) return 'multi';
  if (/当日|单日|每日|日收盘|日涨|日跌|日换手|日振幅|日价格|日成交/.test(reason)) return 'day';
  return 'unspecified';
}
export const periodLabels: Record<PeriodFilter, string> = {
  all: '全部期间', day: '当日', multi: '跨日累计', unspecified: '期间未标明',
};
export function reasonLabel(reason: string): string {
  return ['涨幅偏离', '跌幅偏离', '换手率', '振幅', '成交量', '无价格涨跌幅限制'].find((label) => reason.includes(label))
    || (reason.length > 12 ? `${reason.slice(0, 12)}…` : reason) || '未提供原因';
}
export const flowValue = (value: string | null): FundingFlow => (value === 'buy' || value === 'sell' ? value : 'all');
export const periodValue = (value: string | null): PeriodFilter => (['day', 'multi', 'unspecified'].includes(value || '') ? value as PeriodFilter : 'all');

export function filterDragonRows<T extends { name: string; tsCode: string; reason: string; netAmount: number | null }>(rows: T[], keyword: string, flow: FundingFlow, period: PeriodFilter): T[] {
  const search = keyword.trim().toLowerCase();
  return rows.filter((r) => `${r.name} ${r.tsCode}`.toLowerCase().includes(search)
    && (flow === 'all' || (r.netAmount != null && (flow === 'buy' ? r.netAmount > 0 : r.netAmount < 0)))
    && (period === 'all' || fundingPeriod(r.reason) === period));
}

export const dragonRowKey = (r: { tsCode: string; reason: string }) => JSON.stringify([r.tsCode, r.reason]);
