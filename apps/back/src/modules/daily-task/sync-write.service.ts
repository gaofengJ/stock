/* eslint-disable no-restricted-syntax, no-await-in-loop */
import {
  ConflictException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import {
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';
import { DailyEntity } from '../source/daily/daily.entity';
import { LimitEntity } from '../source/limit/limit.entity';
import { SentiEntity } from '../processed/senti/senti.entity';
import { TradeCalEntity } from '../source/trade-cal/trade-cal.entity';
import { SyncRunEntity } from './sync-run.entity';
import { SyncDayPolicyEntity } from './sync-day-policy.entity';
import { calculateMood, normalizeDate, shanghaiDate } from './sync.utils';
import { MarketDailyEntity } from '../analysis/market/market.entity';
import { StockEntity } from '../source/stock/stock.entity';
import { marketCoverage } from './sync-source.service';

const keys: Record<string, string[]> = {
  t_source_daily: ['tsCode', 'tradeDate'],
  t_source_limit: ['tsCode', 'tradeDate', 'limit'],
  t_processed_senti: ['tradeDate'],
  t_source_trade_cal: ['calDate'],
  t_source_stock: ['tsCode'],
  t_source_active_funds: ['name'],
};

function businessKey(fields: ObjectLiteral, columns: string[]) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields))
    throw new BadRequestException('每条数据必须是对象');
  const where: ObjectLiteral = {};
  columns.forEach((column) => {
    const value = fields[column];
    if (typeof value !== 'string' || !value.trim())
      throw new BadRequestException(`业务键 ${column} 不能为空`);
    if (['tradeDate', 'calDate'].includes(column)) {
      try {
        normalizeDate(value);
      } catch {
        throw new BadRequestException(`业务键 ${column} 必须为 YYYY-MM-DD`);
      }
    }
    if (column === 'limit' && !['U', 'D', 'Z'].includes(value))
      throw new BadRequestException('涨跌停类型异常');
    where[column] = value;
  });
  return where;
}

@Injectable()
export class SyncWriteService {
  private static readonly context = new AsyncLocalStorage<{
    db: DataSource;
    manager: EntityManager;
  }>();

  private readonly logger = new Logger(SyncWriteService.name);

  constructor(private readonly db: DataSource) {}

  async withLock<T>(
    action: (manager: EntityManager) => Promise<T>,
    skipBusy = false,
    allowNested = false,
  ): Promise<T | undefined> {
    const active = SyncWriteService.context.getStore();
    if (active?.db === this.db) return action(active.manager);
    const runner = this.db.createQueryRunner();
    const name = `stock-sync:${createHash('sha256')
      .update(String(this.db.options.database))
      .digest('hex')
      .slice(0, 40)}`;
    let acquired = false;
    try {
      await runner.connect();
      const [result] = await runner.query('SELECT GET_LOCK(?, 0) AS acquired', [
        name,
      ]);
      acquired = Number(result.acquired) === 1;
      if (!acquired) {
        if (skipBusy) {
          this.logger.log('同步检查跳过：数据库写锁被占用');
          return undefined;
        }
        throw new ConflictException('数据同步或写入正在进行，请稍后重试');
      }
      if (!allowNested) return await action(runner.manager);
      return await SyncWriteService.context.run(
        { db: this.db, manager: runner.manager },
        () => action(runner.manager),
      );
    } finally {
      try {
        if (acquired) await runner.query('SELECT RELEASE_LOCK(?)', [name]);
      } finally {
        await runner.release();
      }
    }
  }

  async excluded(manager: EntityManager, date: string) {
    return !!(await manager.findOneBy(SyncDayPolicyEntity, {
      tradeDate: date,
    }));
  }

  async exclude(manager: EntityManager, dates: string[]) {
    for (const tradeDate of new Set(dates)) {
      await manager.upsert(
        SyncDayPolicyEntity,
        { tradeDate, reason: 'manual-delete' },
        ['tradeDate'],
      );
    }
  }

  async markChanged(manager: EntityManager) {
    const tradeDate = shanghaiDate();
    const revision = await manager.findOneBy(SyncRunEntity, {
      task: 'write',
      tradeDate,
    });
    await manager.save(SyncRunEntity, {
      ...revision,
      task: 'write',
      tradeDate,
      status: 'success',
      attempts: (revision?.attempts || 0) + 1,
      error: null,
    });
  }

  async rawReady(manager: EntityManager, date: string) {
    if (await this.excluded(manager, date)) return false;
    const dailyCount = await manager.countBy(DailyEntity, { tradeDate: date });
    if (!dailyCount) return false;
    const codes = await manager.find(DailyEntity, {
      where: { tradeDate: date },
      select: { tsCode: true },
    });
    const stocks = await manager.find(StockEntity, {
      select: { tsCode: true, listDate: true },
    });
    if (
      !marketCoverage(
        codes.map((r) => r.tsCode),
        stocks,
        date,
      )
    )
      return false;
    const limitCount = await manager.countBy(LimitEntity, { tradeDate: date });
    const run = await manager.findOneBy(SyncRunEntity, {
      task: 'daily',
      tradeDate: date,
    });
    return run
      ? ['success', 'pending'].includes(run.status) &&
          run.dailyCount === dailyCount &&
          run.limitCount === limitCount
      : limitCount > 0;
  }

  async writeMood(manager: EntityManager, date: string) {
    if (await this.excluded(manager, date)) return false;
    const cal = await manager.findOneBy(TradeCalEntity, { calDate: date });
    if (
      !cal?.preTradeDate ||
      cal.preTradeDate >= date ||
      !(await this.rawReady(manager, cal.preTradeDate))
    )
      return false;
    const current = await manager.findBy(DailyEntity, { tradeDate: date });
    if (!current.length) return false;
    const limits = await manager.findBy(LimitEntity, { tradeDate: date });
    const previous = await manager.findBy(DailyEntity, {
      tradeDate: cal.preTradeDate,
    });
    const previousLimits = await manager.findBy(LimitEntity, {
      tradeDate: cal.preTradeDate,
    });
    await manager.delete(SentiEntity, { tradeDate: date });
    await manager.insert(
      SentiEntity,
      calculateMood(date, current, limits, previous, previousLimits),
    );
    return true;
  }

  async reconcile(manager: EntityManager, dates: string[], rawChanged = true) {
    const affected = new Set(dates);
    if (rawChanged) {
      for (const date of dates) {
        const next = await manager.findOne(TradeCalEntity, {
          where: { preTradeDate: date, isOpen: 1 },
          order: { calDate: 'ASC' },
        });
        if (next) affected.add(next.calDate);
        const prior = await manager.findOneBy(SyncRunEntity, {
          task: 'daily',
          tradeDate: date,
        });
        await manager.save(SyncRunEntity, {
          ...prior,
          task: 'daily',
          tradeDate: date,
          status: 'pending',
          attempts: prior?.attempts || 0,
          dailyCount: await manager.countBy(DailyEntity, { tradeDate: date }),
          limitCount: await manager.countBy(LimitEntity, { tradeDate: date }),
          sentiCount: 0,
          error: '业务数据已修改，等待情绪重算',
        });
      }
    }
    for (const date of [...affected].sort()) {
      if (manager.connection.hasMetadata(MarketDailyEntity)) {
        await manager.delete(MarketDailyEntity, { tradeDate: date });
        await manager.update(
          SyncRunEntity,
          { task: 'market', tradeDate: date },
          { status: 'pending', error: '数据已修改，等待市场汇总重算' },
        );
      }
      if (rawChanged) await manager.delete(SentiEntity, { tradeDate: date });
      const ready = rawChanged
        ? (await this.rawReady(manager, date)) &&
          (await this.writeMood(manager, date))
        : !(await this.excluded(manager, date)) &&
          (await manager.countBy(SentiEntity, { tradeDate: date })) === 1 &&
          (await this.rawReady(manager, date));
      await manager.update(
        SyncRunEntity,
        { task: 'daily', tradeDate: date },
        {
          status: ready ? 'success' : 'pending',
          sentiCount: ready ? 1 : 0,
          error: ready ? null : '主动删除或依赖数据不足，等待手动恢复或补算',
        },
      );
    }
  }

  async mutate<T extends ObjectLiteral>(
    entity: EntityTarget<T>,
    action: 'save' | 'update' | 'delete' | 'clear',
    input?: any,
    id?: number,
  ) {
    return this.withLock((manager) =>
      manager.transaction(async (tx) => {
        const repo = tx.getRepository(entity);
        const businessKeys = keys[repo.metadata.tableName];
        if (!businessKeys) throw new Error('不支持的同步业务表');
        const dated = businessKeys.includes('tradeDate');
        const dates = new Set<string>();
        let count = 0;
        try {
          if (action === 'save') {
            const rows = Array.isArray(input) ? input : [input];
            for (const row of rows) {
              const where = businessKey(row, businessKeys);
              const existing = await repo.findOne({
                where: where as any,
                order: { id: 'DESC' } as any,
              });
              const fields = { ...row };
              delete fields.id;
              await repo.save({ ...existing, ...fields } as any);
              if (dated) dates.add(row.tradeDate);
            }
            count = rows.length;
          } else if (action === 'update') {
            const existing = await repo.findOneBy({ id } as any);
            if (!existing) throw new NotFoundException('未找到该记录');
            const next = { ...existing, ...input, id };
            const where = businessKey(next, businessKeys);
            const matches = await repo.findBy(where as any);
            if (matches.some((row) => row.id !== id))
              throw new ConflictException('相同业务键的数据已经存在');
            await repo.save(next as any);
            if (dated) {
              dates.add(existing.tradeDate);
              dates.add(next.tradeDate);
            }
          } else {
            let where = input;
            if (action === 'clear') where = {};
            else if (id !== undefined) where = { id };
            let rows: any[] = [];
            if (action === 'clear') {
              if (dated)
                rows = await repo
                  .createQueryBuilder('item')
                  .select(
                    "DISTINCT DATE_FORMAT(item.tradeDate, '%Y-%m-%d')",
                    'tradeDate',
                  )
                  .getRawMany();
            } else
              rows = await repo.find({
                where: where as any,
                select: (dated ? ['id', 'tradeDate'] : ['id']) as any,
              });
            if (id !== undefined && !rows.length)
              throw new NotFoundException('未找到该记录');
            for (const row of rows) if (dated) dates.add(row.tradeDate);
            if (dated && input?.tradeDate) dates.add(input.tradeDate);
            if (dated) await this.exclude(tx, [...dates]);
            const result =
              action === 'clear'
                ? await repo.createQueryBuilder().delete().execute()
                : await repo.delete(where as any);
            count = result.affected || 0;
          }
          if (dated && dates.size)
            await this.reconcile(
              tx,
              [...dates],
              repo.metadata.tableName !== 't_processed_senti',
            );
          await this.markChanged(tx);
          return count;
        } catch (error) {
          if (
            error?.code === 'ER_DUP_ENTRY' ||
            error?.driverError?.code === 'ER_DUP_ENTRY'
          )
            throw new ConflictException('相同业务键的数据已经存在');
          throw error;
        }
      }),
    );
  }
}
