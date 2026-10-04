import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

/** Bounded source-response cache shared by company, risk, events and seats. */
@Entity('t_source_basic_snapshot')
@Index('uq_basic_snapshot_key', ['snapshotKey'], { unique: true })
export class BasicSnapshotEntity extends CommonEntity {
  @Column({ name: 'snapshot_key', length: 64 }) snapshotKey: string;

  @Column({ length: 32 }) source: string;

  @Column({ type: 'json' }) params: Record<string, unknown>;

  @Column({ name: 'data', type: 'json' }) rows: Record<string, any>[];

  @Column({ name: 'fetched_at', type: 'datetime', nullable: true })
  fetchedAt: Date | null;

  @Column({ name: 'retry_at', type: 'datetime' }) retryAt: Date;

  @Column({ type: 'varchar', length: 256, nullable: true }) error:
    | string
    | null;
}
