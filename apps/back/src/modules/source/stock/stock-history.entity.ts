import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';
import { StockEntity } from './stock.entity';

export interface HistoricalStock {
  profile?: Partial<StockEntity>;
  listStatus?: string;
  tsCode: string;
  name: string;
  listDate: string;
  delistDate: string | null;
}

export interface HistoricalName {
  tsCode: string;
  name: string;
  startDate: string;
  endDate: string | null;
}

/** Identity periods and compact per-date name supplements; no daily price copies. */
@Entity('t_source_stock_history')
@Index('uq_stock_history_key', ['snapshotKey'], { unique: true })
export class StockHistoryEntity extends CommonEntity {
  @Column({ name: 'snapshot_key', length: 16 }) snapshotKey: string;

  @Column({ name: 'as_of', type: 'date' }) asOf: string;

  @Column({ type: 'json' }) data: {
    stocks: HistoricalStock[];
    names: HistoricalName[];
    checkedCodes?: string[];
    checkedAt?: string;
  };
}
