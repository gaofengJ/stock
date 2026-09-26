import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 't_sync_day_policy' })
export class SyncDayPolicyEntity {
  @PrimaryColumn({ name: 'trade_date', type: 'date' })
  tradeDate: string;

  @Column({ type: 'varchar', length: 64 })
  reason: string;
}
