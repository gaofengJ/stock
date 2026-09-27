import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';
import { MarketScope } from './market.constants';
import { MarketStats } from './market.utils';

@Entity('t_source_index_daily')
@Index('uq_index_date_code', ['tradeDate', 'tsCode'], { unique: true })
export class IndexDailyEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ name: 'ts_code', length: 16 }) tsCode: string;

  @Column({ type: 'json' }) data: {
    close: number;
    open: number;
    high: number;
    low: number;
    preClose: number;
    pctChg: number;
    amount: number;
    vol: number;
  };
}

@Entity('t_processed_market_daily')
@Index('uq_market_date_scope', ['tradeDate', 'scope'], { unique: true })
export class MarketDailyEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ length: 8 }) scope: MarketScope;

  @Column({ type: 'json' }) data: MarketStats;
}

@Entity('t_source_bse_mapping')
export class BseMappingEntity extends CommonEntity {
  @Index({ unique: true })
  @Column({ name: 'old_code', length: 16 })
  oldCode: string;

  @Column({ name: 'new_code', length: 16 }) newCode: string;
}
