import { finiteNumber } from '@/utils/format';

export type AnalysisState = 'ready' | 'missing' | 'pending' | 'running' | 'failed' | 'protected';
export type NullableAnalysisSeries<T extends { tradeDate: string }[]> = Array<{
  [Key in keyof T[number]]: T[number][Key] | null;
} & { tradeDate: string; state?: AnalysisState }>;

export function hasAnalysisValues(rows: { tradeDate: string; state?: AnalysisState; [key: string]: unknown }[]) {
  return rows.some((row) => (!row.state || row.state === 'ready') && Object.entries(row).some(([key, value]) => key !== 'tradeDate' && key !== 'state' && finiteNumber(value) !== null));
}

export function analysisAmount(value: unknown) {
  const amount = finiteNumber(value);
  return amount == null ? null : amount / 100000000;
}

export function distributionTotals(rows: { count: number | null; state?: AnalysisState }[]) {
  const empty = { countPositive: null, countZero: null, countNegative: null };
  if (!rows.length || rows.some((row) => (row.state && row.state !== 'ready') || row.count == null)) return empty;
  return {
    countPositive: rows.slice(0, 10).reduce((sum, row) => sum + row.count!, 0),
    countZero: rows[10]?.count ?? null,
    countNegative: rows.slice(11).reduce((sum, row) => sum + row.count!, 0),
  };
}
