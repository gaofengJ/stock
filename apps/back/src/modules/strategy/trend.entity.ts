import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

/** Compact per-day tuples: code, adjusted open/close/high/low. No duplicate raw prices. */
export type TrendFactor = [
  string,
  number | null,
  number | null,
  number | null,
  number | null,
];
@Entity('t_source_strategy_factor')
@Index('uq_strategy_factor_date', ['tradeDate'], { unique: true })
export class TrendFactorEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ type: 'json' }) data: TrendFactor[];
}
