import type { IntradayCountPoint } from '@/api/intraday-counts';

export interface IntradayPlotRow {
  label: string;
  date: string;
  time: string;
  point: IntradayCountPoint | null;
  first: boolean;
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
