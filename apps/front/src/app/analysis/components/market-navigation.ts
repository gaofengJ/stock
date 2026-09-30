import type { MarketScope } from '@/api/market';

export interface Selection { date: string; scope: MarketScope; days: number }
export const defaultSelection: Selection = { date: '', scope: 'all', days: 20 };
export function linkedLimitType(value: string | null) {
  return value === 'D' || value === 'Z' ? value : 'U';
}
export function linkedSelection(query: string): Partial<Selection> {
  const params = new URLSearchParams(query);
  const date = params.get('date') || '';
  const scope = params.get('scope') as MarketScope;
  return {
    ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : {}),
    ...(['all', 'hs', 'main', 'gem', 'star', 'bj'].includes(scope) ? { scope } : {}),
  };
}
export function marketHref(path: string, selection: Pick<Selection, 'date' | 'scope'>, extra: Record<string, string> = {}) {
  return `${path}/?${new URLSearchParams({ date: selection.date, scope: selection.scope, ...extra })}`;
}
