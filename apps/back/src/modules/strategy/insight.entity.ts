import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

export interface StockInsight {
  code: string;
  name: string;
  close: number | null;
  basis: string;
  conversion?: number | null;
  traded: boolean;
  periods: Record<
    string,
    { change: number; rps: number | null; high: boolean; low: boolean } | null
  >;
}
export interface SignalSnapshot {
  version: string;
  parameters: object;
  ready: string[];
  items: { code: string; keys: string[] }[];
}
@Entity('t_processed_stock_insight')
@Index('uq_stock_insight_date', ['tradeDate'], { unique: true })
export class StockInsightEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ length: 64 }) revision: string;

  @Column({ type: 'json' }) data: StockInsight[];

  @Column({ type: 'json' }) signals: SignalSnapshot;

  @Column({ type: 'json' }) summary: Record<string, any>;
}
export interface HotStock {
  code: string;
  name: string;
  rank: number;
  hot: number | null;
  time: string;
}
@Entity('t_source_ths_hot')
@Index('uq_ths_hot_date', ['tradeDate'], { unique: true })
export class ThsHotEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ type: 'json' }) data: HotStock[];

  @Column({ name: 'rank_time', length: 32 }) rankTime: string;
}
