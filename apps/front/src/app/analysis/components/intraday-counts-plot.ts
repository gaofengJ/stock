import type { IntradayCountPoint } from '@/api/intraday-counts';

export interface IntradayPlotRow {
  label: string;
  date: string;
  time: string;
  point: IntradayCountPoint | null;
  first: boolean;
}

export interface IntradayDistribution {
  min: number;
  max: number;
  ice: number;
  boiling: number;
  count: number;
  canClassify: boolean;
}

/** Linear-interpolated percentiles of valid observations in the selected trading days. */
export function intradayDistribution(rows: IntradayPlotRow[]): IntradayDistribution | null {
  const values = rows.flatMap((row) => {
    const value = row.point?.up;
    return value != null && Number.isFinite(value) && value >= 0 ? [value] : [];
  }).sort((a, b) => a - b);
  if (!values.length) return null;
  const quantile = (fraction: number) => {
    const index = (values.length - 1) * fraction;
    const lower = Math.floor(index);
    return values[lower] + (values[Math.ceil(index)] - values[lower]) * (index - lower);
  };
  const ice = quantile(0.2);
  const boiling = quantile(0.8);
  return {
    min: values[0],
    max: values[values.length - 1],
    ice,
    boiling,
    count: values.length,
    canClassify: values.length >= 5 && ice < boiling,
  };
}

export function intradayPhase(up: number | null | undefined, distribution: IntradayDistribution | null) {
  if (up == null || !Number.isFinite(up) || up < 0 || !distribution) return null;
  if (!distribution.canClassify) return '常规区间';
  if (up <= distribution.ice) return '冰点';
  if (up >= distribution.boiling) return '沸点';
  return '常规区间';
}

/** Only actual 15:00 observations are daily closes; an absent close breaks the overview. */
export function intradayCloses(rows: IntradayPlotRow[]) {
  return rows.filter((row) => row.time === '15:00').map((row) => [
    row.label, row.point?.up ?? null,
  ]);
}

const sessionTimes = [[570, 690], [780, 900]].flatMap(([start, end]) => Array.from(
  { length: (end - start) / 5 + 1 },
  (_, i) => {
    const minutes = start + i * 5;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  },
));

/** Trading sessions are adjacent; genuine missing samples still break the line. */
export function intradayPlot(points: IntradayCountPoint[], dates: string[]): IntradayPlotRow[] {
  const bySlot = new Map(points.map((point) => [`${point.date} ${point.time}`, point]));
  const latest = points.at(-1);
  return dates.flatMap((date) => {
    const dayPoints = points.filter((point) => point.date === date);
    const historyOnly = dayPoints.length > 0 && dayPoints.every((point) => point.source === 'history_5m');
    const times = sessionTimes.filter((time) => (
      (!historyOnly || (time !== '09:30' && time !== '13:00'))
      && (date !== latest?.date || time <= latest.time)
    ));
    const rows = times.map((time, index) => ({
      label: `${date} ${time}`, date, time, point: bySlot.get(`${date} ${time}`) || null, first: index === 0,
    }));
    return rows;
  });
}

export function intradayMean(rows: IntradayPlotRow[], selected: Record<string, boolean>) {
  const fields = ([['up', '上涨家数'], ['down', '下跌家数']] as const).filter(([, name]) => selected[name] !== false);
  if (fields.length !== 1) return null;
  const [key, name] = fields[0];
  const values = rows.flatMap((row) => {
    const value = row.point?.[key];
    return value != null && Number.isFinite(value) ? [value] : [];
  });
  return values.length ? { key, name, value: values.reduce((sum, value) => sum + value, 0) / values.length } : null;
}
