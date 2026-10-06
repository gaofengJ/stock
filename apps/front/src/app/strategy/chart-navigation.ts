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
  const start = Math.max(0, Math.min(length - width, range.start + Math.sign(direction)));
  return { start, end: start + width - 1 };
}

export function pagedChartRange<T extends { date: string }>(previous: T[], incoming: T[], range: ChartRange, direction: number) {
  const series = Array.from(new Map([...previous, ...incoming].map((point) => [point.date, point])).values()).sort((a, b) => a.date.localeCompare(b.date));
  const start = series.findIndex((point) => point.date === previous[range.start]?.date);
  const moved = shiftedChartRange({ start, end: start + range.end - range.start }, series.length, direction);
  // Keep MA120 history and some room to pan without retaining unlimited pages.
  const from = Math.max(0, moved.start - 240);
  const to = Math.min(series.length, moved.end + 241);
  return {
    series: series.slice(from, to), range: { start: moved.start - from, end: moved.end - from }, clippedEarlier: from > 0, clippedLater: to < series.length,
  };
}
