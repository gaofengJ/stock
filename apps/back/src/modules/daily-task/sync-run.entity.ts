import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

export type SyncStatus = 'running' | 'success' | 'failed' | 'pending';

@Entity({ name: 't_sync_run', comment: '数据同步状态' })
@Index('uq_sync_task_date', ['task', 'tradeDate'], { unique: true })
export class SyncRunEntity extends CommonEntity {
  @Column({ type: 'varchar', length: 32 })
  task: string;

  @Column({ name: 'trade_date', type: 'date' })
  tradeDate: string;

  @Column({ type: 'varchar', length: 16 })
  status: SyncStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'daily_count', type: 'int', default: 0 })
  dailyCount: number;

  @Column({ name: 'limit_count', type: 'int', default: 0 })
  limitCount: number;

  @Column({ name: 'senti_count', type: 'int', default: 0 })
  sentiCount: number;

  @Column({ type: 'text', nullable: true })
  error: string | null;
}
