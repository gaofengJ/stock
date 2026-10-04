export interface TrendOptions {
  breakoutDays: number; volumeDays: number; volumeMultiple: number;
  pullbackDays: number; pullbackBelow: number; pullbackAbove: number; contractionRatio: number;
  fiveMaMode: 'new' | 'current'; aboveMa5: boolean; bullish: boolean; expandingVolume: boolean;
}
export const trendDefaults: TrendOptions = {
  breakoutDays: 20,
  volumeDays: 5,
  volumeMultiple: 1.5,
  pullbackDays: 10,
  pullbackBelow: 2,
  pullbackAbove: 3,
  contractionRatio: 0.8,
  fiveMaMode: 'new',
  aboveMa5: false,
  bullish: false,
  expandingVolume: false,
};
export const isTrendStrategy = (key: string) => ['volumeBreakout', 'breakoutPullback', 'fiveMaUp'].includes(key);
