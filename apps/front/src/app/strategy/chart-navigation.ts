export type ChartRange = { start: number; end: number };

export function initialChartRange(dates: string[], signal: string, view: string, anchor?: string): ChartRange {
  if (!dates.length) return { start: 0, end: 0 };
  if (view === 'after') {
    const start = Math.max(0, dates.indexOf(anchor || signal));
    return { start, end: Math.min(start + 59, dates.length - 1) };
  }
  const signalIndex = dates.indexOf(signal);
  const end = view === 'signal' && signalIndex >= 0
    ? Math.min(dates.length - 1, signalIndex + 20) : dates.length - 1;
  return { start: Math.max(0, end - 59), end };
}

export function shiftedChartRange(range: ChartRange, length: number, direction: number): ChartRange {
  const width = Math.min(length, range.end - range.start + 1);
  const start = Math.max(0, Math.min(length - width, range.start + direction * Math.max(1, Math.floor(width / 2))));
  return { start, end: start + width - 1 };
}
