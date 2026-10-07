import type { Account } from '@/auth/client';

export const validStockCode = (code: string) => /^\d{6}\.(SH|SZ|BJ)$/.test(code);
export const stockSymbol = (code: string) => code.split('.')[0];
export function stockDate(date?: string): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}
export function stockHref(code: string, date?: string) {
  const asOf = stockDate(date);
  return `/basic/stock/detail/?${new URLSearchParams({ code, ...(asOf ? { date: asOf } : {}) })}`;
}
/** Match the chart endpoint's existing strategy/basic-stock/review permissions. */
export const canViewStockChart = (user: Account | null) => !!user?.permissions.some((permission) => ['strategy:read', 'basic:stock', 'review:read'].includes(permission));
