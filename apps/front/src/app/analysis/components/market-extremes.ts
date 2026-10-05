export interface ExtremeMeasure {
  high: number; low: number; highRatio: number | null; lowRatio: number | null; eligible: number; excluded: number;
}
export interface Extremes {
  date: string; scope: string; ready: boolean; period: number; snapshot: ExtremeMeasure | null;
  series: { date: string; data: ExtremeMeasure | null }[];
  items: { code: string; name: string; high: boolean; low: boolean; change: number }[];
}
export type ExtremeKey = 'high' | 'low';
export type ExtremeMetric = 'count' | 'ratio';

/** Never present an older valid summary as the requested trading day's data. */
export function extremeSummary(data: Extremes | null) {
  if (!data) return null;
  if (data.snapshot) return { date: data.date, data: data.snapshot };
  return data.series.filter((row) => row.date <= data.date && row.data)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

export function extremeValues(series: Extremes['series'], key: ExtremeKey, metric: ExtremeMetric) {
  return series.map((row) => {
    const value = metric === 'ratio' ? row.data?.[key === 'high' ? 'highRatio' : 'lowRatio'] : row.data?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  });
}

export function extremeMean(series: Extremes['series'], metric: ExtremeMetric, selected: Record<string, boolean>) {
  const visible = (['high', 'low'] as const).filter((key) => selected[key === 'high' ? '新高' : '新低'] !== false);
  if (visible.length !== 1) return null;
  const key = visible[0];
  const values = extremeValues(series, key, metric).filter((value): value is number => value != null);
  return values.length ? { key, value: values.reduce((sum, value) => sum + value, 0) / values.length } : null;
}
