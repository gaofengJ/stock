export interface IntradayCountPoint {
  date: string;
  time: string;
  up: number;
  down: number;
  collectedAt: string;
}

export interface IntradayCounts {
  source: string;
  scope: 'all';
  intervalMinutes: number;
  retentionDays: number;
  endDate: string;
  dates: string[];
  points: IntradayCountPoint[];
}
