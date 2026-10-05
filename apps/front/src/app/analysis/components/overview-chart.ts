import { numberText } from '@/utils/format';

/** Fixed date sampling keeps equal windows comparable regardless of chart width. */
export function overviewDateAxis(dates: string[]) {
  const step = Math.max(1, Math.ceil((dates.length - 1) / 4));
  return {
    type: 'category' as const,
    data: dates,
    boundaryGap: true,
    axisPointer: { snap: true },
    axisTick: { alignWithLabel: true },
    axisLabel: {
      interval: (index: number) => index === 0 || index === dates.length - 1 || (index % step === 0 && index < dates.length - 1 - step / 2),
      showMinLabel: true,
      showMaxLabel: true,
      hideOverlap: true,
      formatter: (date: string) => date.slice(5),
    },
  };
}

export const overviewGrid = {
  left: 64, right: 32, top: 56, bottom: 32,
};

/** The existing legend becomes the readout only while a trading date is hovered. */
export function hoverAverageLabel(name: string, date: string | null, candles: { date: string }[], averages: { name: string; values: (number | null)[] }[]) {
  const position = candles.findIndex((c) => c.date === date);
  if (position < 0) return name;
  const average = averages.find((a) => a.name === name);
  const value = average?.values[position];
  const prior = average?.values[position - 1];
  let arrow = '';
  if (value != null && prior != null && value !== prior) arrow = value > prior ? '↑' : '↓';
  return `${name}: ${numberText(value)}${arrow}`;
}
