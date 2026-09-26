import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SyncWriteService } from '../daily-task/sync-write.service';

@Injectable()
export class DataLockService {
  private readonly writes: SyncWriteService;

  constructor(db: DataSource) {
    this.writes = new SyncWriteService(db);
  }

  async run<T>(action: () => Promise<T>): Promise<T> {
    return (await this.writes.withLock(action, false, true)) as T;
  }
}
