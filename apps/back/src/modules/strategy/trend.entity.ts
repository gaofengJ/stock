import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

/** Compact per-day tuples: code, adjusted open/close/high/low. No duplicate raw prices. */
export type TrendFactor = [
  string,
  number | null,
  number | null,
  number | null,
  number | null,
  string?,
  number?,
];
@Entity('t_source_strategy_factor')
@Index('uq_strategy_factor_date', ['tradeDate'], { unique: true })
export class TrendFactorEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ type: 'json' }) data: TrendFactor[];

  @Column({
    name: 'content_hash',
    type: 'char',
    length: 32,
    asExpression: 'MD5(data)',
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  contentHash: string;

  @Column({
    name: 'packed_data',
    type: 'mediumblob',
    asExpression: 'COMPRESS(data)',
    generatedType: 'STORED',
    select: false,
    insert: false,
    update: false,
  })
  packedData: Buffer;
}
