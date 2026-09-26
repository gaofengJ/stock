import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class DataLockService {
  private context = new AsyncLocalStorage<boolean>();

  constructor(private db: DataSource) {}

  async run<T>(action: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return action();
    const q = this.db.createQueryRunner();
    const name = `stock-sync:${createHash('sha256')
      .update(String(this.db.options.database))
      .digest('hex')
      .slice(0, 40)}`;
    let locked = false;
    try {
      await q.connect();
      const [r] = await q.query('SELECT GET_LOCK(?,0) acquired', [name]);
      locked = Number(r.acquired) === 1;
      if (!locked)
        throw new ConflictException('数据同步或写入正在进行，请稍后重试');
      return await this.context.run(true, action);
    } finally {
      try {
        if (locked) await q.query('SELECT RELEASE_LOCK(?)', [name]);
      } finally {
        await q.release();
      }
    }
  }
}
