import type { IndexPoint } from './market';

export interface SectorLink { code: string; name: string; type: 'I' | 'N'; asOf?: string }
export interface ClassifiedStock { industries?: SectorLink[]; topics?: SectorLink[] }
export interface SectorOptions { items: SectorLink[]; asOf: string | null }
export interface SectorRow {
  code: string; name: string; type: 'I' | 'N'; asOf: string | null;
  day: number | null; five: number | null; twenty: number | null;
  memberCount: number | null; traded: number | null; upRatio: number | null; limitUp: number | null;
  amount: number | null; amountShare: number | null; maxHeight: number | null;
}
export interface SectorMember extends ClassifiedStock {
  tsCode: string; name: string; close: string | null; pctChg: string | null; amount: string | null; limitUp: boolean;
}
export interface SectorBoard {
  date: string; kind: 'I' | 'N'; period: 1 | 5 | 20; dates: string[]; items: SectorRow[];
  rotation: { date: string; total: number; values: { code: string; value: number | null; rank: number | null }[] }[];
  detail: { code: string; name: string; asOf: string | null; series: IndexPoint[]; members: SectorMember[] } | null;
  job: { status: string; stage: string; error: string | null } | null;
}
