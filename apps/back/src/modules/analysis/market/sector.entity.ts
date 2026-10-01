import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

@Entity('t_source_ths_sector')
export class SectorEntity extends CommonEntity {
  @Index('uq_ths_sector_code', { unique: true })
  @Column({ name: 'ts_code', length: 16 })
  tsCode: string;

  @Column({ length: 100 }) name: string;

  @Column({ length: 1 }) type: 'I' | 'N';

  @Column({ type: 'int' }) count: number;

  @Column({ type: 'boolean', default: true }) active: boolean;
}

@Entity('t_source_ths_members')
@Index('uq_ths_members_date_code', ['asOf', 'tsCode'], { unique: true })
export class SectorMembersEntity extends CommonEntity {
  @Column({ name: 'as_of', type: 'date' }) asOf: string;

  @Column({ name: 'ts_code', length: 16 }) tsCode: string;

  @Column({ type: 'json' }) members: { code: string; name: string }[];
}

@Entity('t_source_ths_daily')
@Index('uq_ths_daily_date_code', ['tradeDate', 'tsCode'], { unique: true })
export class SectorDailyEntity extends CommonEntity {
  @Column({ name: 'trade_date', type: 'date' }) tradeDate: string;

  @Column({ name: 'ts_code', length: 16 }) tsCode: string;

  @Column({ type: 'json' }) data: {
    open: number;
    close: number;
    high: number;
    low: number;
    preClose: number;
    pctChange: number;
    vol: number;
  };
}
