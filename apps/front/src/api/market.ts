import axios from './request';
import type { RequestConfig } from './types';
import type { ClassifiedStock } from './sectors';

export type MarketScope = 'all' | 'hs' | 'main' | 'gem' | 'star' | 'bj';
export interface MarketStats {
  amount: number; up: number; down: number; flat: number; total: number; upRatio: number | null;
  distribution: number[]; limitUp: number; limitDown: number; broken: number; maxHeight: number;
  sealRate: number | null; brokenRate: number | null; previousSample: number;
  highOpenRate: number | null; riseRate: number | null; averageChange: number | null;
  counts: number[]; limitAmount: number; chainAmount: number;
  upgrades: { from: number; numerator: number; denominator: number; rate: number | null }[];
}
export interface MarketStatus {
  revision: string;
  dateUpdates?: Record<string, string>;
  latestDate: string | null; expectedDate: string | null; dates: string[];
  stages: { task: string; status: string; updatedAt: string; error: string | null }[];
  backfill: { id: number; status: string; stage: string; error: string | null } | null;
}
export interface IndexPoint {
  date: string; close: number; pctChg: number; amount: number;
  open?: number; high?: number; low?: number; preClose?: number; vol?: number;
}
export interface MarketSeries {
  status: MarketStatus; date: string | null; snapshot: MarketStats | null;
  previousAmount?: number | null; fiveDayAmount?: number | null; twentyDayAmount?: number | null; updatedAt?: string;
  series: { date: string; data: MarketStats | null }[];
  indexes: { code: string; name: string; series: IndexPoint[] }[];
  markets: (MarketStats & { scope: string })[];
}
export interface BreadthMeasure {
  above: number; eligible: number; insufficient: number; missing: number; ratio: number | null;
}
export interface MarketBreadth {
  total: number; ma20: BreadthMeasure; ma60: BreadthMeasure;
}
export interface BreadthSeries {
  date: string | null; snapshot: MarketBreadth | null;
  series: { date: string; data: MarketBreadth | null }[];
  stage: { status: string; error: string | null } | null;
}
export interface LimitRow extends ClassifiedStock {
  tsCode: string; name: string; industry: string | null; close: string; pctChg: string;
  amount: string | null; floatMv: string | null; turnoverRatio: string | null;
  fdAmount: string | null; firstTime: string | null; lastTime: string | null;
  openTimes: number | null; limitTimes: number; upStat: string | null;
}
export interface Ladder {
  ready: boolean; items: LimitRow[];
  transitions: { tsCode: string; name: string; previousHeight: number; height: number; state: string; pctChg: number | null }[];
}
export interface DragonData {
  summary: { reason: string; lBuy: number | null; lSell: number | null; netAmount: number | null }[];
  seats: { reason: string; exalter: string; side: string; buy: number | null; sell: number | null; netBuy: number | null }[];
  queriedAt: string;
}
export interface DragonList {
  codes: string[];
  queriedAt: string;
}
export interface DragonListing extends ClassifiedStock {
  tsCode: string; name: string; reason: string;
  close: number | null; pctChange: number | null; turnoverRate: number | null;
  lBuy: number | null; lSell: number | null; netAmount: number | null;
}
export interface DragonBoard { items: DragonListing[]; queriedAt: string }
export const marketRequest = <T>(endpoint: string, params: Record<string, unknown> = {}, config: RequestConfig = {}) => axios.get<T>(`/analysis/market/${endpoint}`, { params, ...config });

export interface FeedbackMember { tsCode: string; name: string; pctChg: number | null; highOpen: boolean; previousHeight: number | null; height: number | null; excluded: string }
export interface FeedbackGroup { key: string; name: string; ready: boolean; total: number; sample: number; excluded: number; average: number | null; median: number | null; riseRate: number | null; highOpenRate: number | null; distribution: number[]; members: FeedbackMember[] }
export interface FeedbackBoard { date: string; previousDate: string | null; ready: boolean; groups: FeedbackGroup[] }
export interface StrategySignals { dates: string[]; readyDates: string[]; strategies: { key: string; label: string }[]; items: { date: string; tsCode: string; strategies: string[] }[] }
export interface TrajectoryCell { date: string; state: string; height: number | null; pctChg: number | null; close?: number; amount?: number }
export interface TrajectoryRow extends ClassifiedStock { tsCode: string; name: string; cells: TrajectoryCell[] }
export interface TrajectoryBoard { date: string; dates: string[]; ready: boolean; items: TrajectoryRow[] }
