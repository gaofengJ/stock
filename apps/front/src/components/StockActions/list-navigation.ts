import { stockDate, validStockCode } from '@/utils/stock-interaction';
import type { ChartSelection } from './context';

/** Keep the displayed order and distinguish repeated signals on different dates. */
export function stockChartNavigation(rows: readonly unknown[], current: ChartSelection): ChartSelection[] {
  const seen = new Set<string>();
  const result: ChartSelection[] = [];
  rows.forEach((value) => {
    if (!value || typeof value !== 'object') return;
    const row = value as Record<string, unknown>;
    const code = row.tsCode || row.code || row.ts_code;
    if (typeof code !== 'string' || !validStockCode(code) || !/^[034689]/.test(code)) return;
    const date = stockDate(typeof row.date === 'string' ? row.date : undefined) || stockDate(current.date);
    const key = `${code}:${date || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ code, name: typeof row.name === 'string' ? row.name : undefined, date });
  });
  // A detail entry outside this list must never navigate into an unrelated list.
  return result.some((row) => row.code === current.code && row.date === stockDate(current.date)) ? result : [];
}
