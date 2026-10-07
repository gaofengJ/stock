import type { LimitRow } from '@/api/market';
import type { WorkbenchSource } from '../../basic/components/workbench-polling';

export interface ThemeStock extends LimitRow {
  theme: string; themes: string[]; reason: string | null; keywords: string[]; sourceStatus: string | null;
}
export interface ThemeGroup {
  name: string; count: number; maxHeight: number; amount: number | null; keywords: string[]; items: ThemeStock[];
}
export interface ThemeBoard {
  date: string; ready: boolean; groups: ThemeGroup[]; total: number; classified: number; explained: number; sources: WorkbenchSource[];
}
export interface ThemeDetail {
  date: string; stock: ThemeStock; announcementStart: string; sources: WorkbenchSource[];
  announcements: { date: string; title: string; url: string | null }[];
  financial: { period: string; announcedAt: string; revenueGrowth: number | null; profitGrowth: number | null; deductedProfit: number | null; roe: number | null } | null;
}
