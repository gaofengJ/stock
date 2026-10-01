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

/** Missing samples stay null; never interpolate lunch, missed polls or overnight. */
export function intradayPlot(points: IntradayCountPoint[], dates: string[]): IntradayPlotRow[] {
  const bySlot = new Map(points.map((point) => [`${point.date} ${point.time}`, point]));
  const latest = points.at(-1);
  return dates.flatMap((date, dayIndex) => {
    const times = sessionTimes.filter((time) => date !== latest?.date || time <= latest.time);
    const rows = times.map((time, index) => ({
      label: `${date} ${time}`, date, time, point: bySlot.get(`${date} ${time}`) || null, first: index === 0,
    }));
    return dayIndex < dates.length - 1
      ? [...rows, {
        label: `${date} close`, date, time: '', point: null, first: false,
      }]
      : rows;
  });
}
