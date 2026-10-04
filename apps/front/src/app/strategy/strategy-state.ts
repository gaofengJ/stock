import dayjs from 'dayjs';
import { trendDefaults, TrendOptions } from './strategy-options';

const bounds: Record<string, [number, number, boolean?]> = {
  breakoutDays: [5, 120, true],
  volumeDays: [3, 20, true],
  volumeMultiple: [1, 5],
  pullbackDays: [3, 20, true],
  pullbackBelow: [0, 10],
  pullbackAbove: [0, 10],
  contractionRatio: [0.1, 1],
};
export function validStrategyDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dayjs(value).format('YYYY-MM-DD') === value ? value : undefined;
}
export function readStrategyOptions(params: { get: (key: string) => string | null }): TrendOptions {
  const options = { ...trendDefaults };
  Object.entries(bounds).forEach(([key, [min, max, integer]]) => {
    const raw = params.get(key); const value = Number(raw);
    if (raw !== null && raw !== '' && Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value))) Object.assign(options, { [key]: value });
  });
  if (params.get('fiveMaMode') === 'current') options.fiveMaMode = 'current';
  (['aboveMa5', 'bullish', 'expandingVolume'] as const).forEach((key) => { options[key] = params.get(key) === 'true'; });
  return options;
}
export function writeStrategyOptions(value?: TrendOptions): Record<string, string | undefined> {
  return Object.fromEntries(Object.keys(trendDefaults).map((key) => [key, value ? String(value[key as keyof TrendOptions]) : undefined]));
}
