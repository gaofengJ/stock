/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue -- 有依赖的同步步骤逐个完成，已完成数据跳过。 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Between, DataSource, EntityManager } from 'typeorm';
import * as dayjs from 'dayjs';
import { TushareService } from '@/shared/tushare/tushare.service';
import { readSnapshot } from '@/modules/daily-task/sync-source.service';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import {
  permanentSyncError,
  shanghaiDate,
} from '@/modules/daily-task/sync.utils';
import {
  BseMappingEntity,
  IndexDailyEntity,
  MarketDailyEntity,
} from './market.entity';
import { MARKET_INDEXES, MARKET_SCOPES } from './market.constants';
import { marketStats } from './market.utils';
import { checkMarketSchema } from './market-schema';

@Injectable()
export class MarketSyncService implements OnModuleInit {
  constructor(
    private db: DataSource,
    private source: TushareService,
    private writes: SyncWriteService,
  ) {}

  async onModuleInit() {
    await checkMarketSchema(this.db);
  }

  async stage(
    manager: EntityManager,
    task: string,
    date: string,
    action: () => Promise<void>,
  ) {
    const old = await manager.findOneBy(SyncRunEntity, {
      task,
      tradeDate: date,
    });
    if (
      old?.status === 'failed' &&
      permanentSyncError(old.error || '') &&
      shanghaiDate(old.updatedAt) === shanghaiDate()
    )
      throw new Error(old.error || '数据源权限或配额错误');
    const run = await manager.save(SyncRunEntity, {
      ...old,
      task,
      tradeDate: date,
      status: 'running',
      attempts: (old?.attempts || 0) + 1,
      error: null,
      updatedAt: new Date(),
    });
    try {
      await action();
      await manager.update(SyncRunEntity, run.id, {
        status: 'success',
        error: null,
        updatedAt: new Date(),
      });
    } catch (e) {
      await manager.update(SyncRunEntity, run.id, {
        status: 'failed',
        error: String(e.message).slice(0, 2000),
        updatedAt: new Date(),
      });
      throw e;
    }
  }

  async mapping(manager: EntityManager, date: string) {
    const latest = await manager.findOne(SyncRunEntity, {
      where: { task: 'bse-mapping', status: 'success' },
      order: { tradeDate: 'DESC' },
    });
    if (latest && dayjs(date).diff(latest.tradeDate, 'day') < 7) return;
    await this.stage(manager, 'bse-mapping', date, async () => {
      const rows = readSnapshot(
        await this.source.queryData('bse_mapping', {}, 'o_code,n_code', 1000),
        ['o_code', 'n_code'],
      );
      const normalized = rows.map((r) => ({
        oldCode: r.oCode,
        newCode: r.nCode,
      }));
      if (new Set(normalized.map((r) => r.oldCode)).size !== normalized.length)
        throw new Error('北交所映射重复');
      await manager
        .createQueryBuilder()
        .insert()
        .into(BseMappingEntity)
        .values(normalized)
        .orUpdate(['new_code'], ['old_code'])
        .updateEntity(false)
        .execute();
    });
  }

  async indexes(manager: EntityManager, date: string, refresh = false) {
    await this.stage(manager, 'market-index', date, async () => {
      const existing = await manager.findBy(IndexDailyEntity, {
        tradeDate: date,
      });
      for (const index of MARKET_INDEXES) {
        if (!refresh && existing.some((r) => r.tsCode === index.code)) continue;
        const rows: Partial<IndexDailyEntity>[] = [];
        const initial = !(await manager.countBy(IndexDailyEntity, {
          tsCode: index.code,
        }));
        const params = initial
          ? {
              start_date: dayjs(date).subtract(2, 'year').format('YYYYMMDD'),
              end_date: date.replace(/-/g, ''),
            }
          : { trade_date: date.replace(/-/g, '') };
        const raw = readSnapshot(
          await this.source.queryData('index_daily', {
            ts_code: index.code,
            ...params,
          }),
          [
            'ts_code',
            'trade_date',
            'close',
            'open',
            'high',
            'low',
            'pre_close',
            'pct_chg',
            'amount',
            'vol',
          ],
        );
        if (
          !raw.some((r) => r.tradeDate === date.replace(/-/g, '')) ||
          raw.some((r) => r.tsCode !== index.code) ||
          new Set(raw.map((r) => r.tradeDate)).size !== raw.length
        )
          throw new Error(`${index.name} ${date} 尚未完整更新`);
        for (const r of raw) {
          if (!/^\d{8}$/.test(r.tradeDate)) throw new Error('指数日期格式异常');
          const tradeDate = `${r.tradeDate.slice(0, 4)}-${r.tradeDate.slice(
            4,
            6,
          )}-${r.tradeDate.slice(6, 8)}`;
          if (
            !dayjs(tradeDate).isValid() ||
            dayjs(tradeDate).format('YYYY-MM-DD') !== tradeDate ||
            tradeDate > date
          )
            throw new Error('指数日期越界');
          const data = Object.fromEntries(
            [
              'close',
              'open',
              'high',
              'low',
              'preClose',
              'pctChg',
              'amount',
              'vol',
            ].map((key) => [key, Number(r[key])]),
          ) as IndexDailyEntity['data'];
          if (Object.values(data).some((n) => !Number.isFinite(n)))
            throw new Error('指数包含无效数值');
          rows.push({ tradeDate, tsCode: index.code, data });
        }
        // 每个指数独立提交；后续指数失败时保留已成功的快照，重试只取缺口。
        await manager.transaction(async (tx) => {
          for (let offset = 0; offset < rows.length; offset += 500)
            await tx
              .createQueryBuilder()
              .insert()
              .into(IndexDailyEntity)
              .values(rows.slice(offset, offset + 500))
              .orUpdate(['data'], ['trade_date', 'ts_code'])
              .updateEntity(false)
              .execute();
        });
      }
    });
  }

  async complete(manager: EntityManager, date: string) {
    const run = await manager.findOneBy(SyncRunEntity, {
      task: 'market',
      tradeDate: date,
      status: 'success',
    });
    return (
      !!run &&
      (await manager.countBy(MarketDailyEntity, { tradeDate: date })) ===
        MARKET_SCOPES.length &&
      (await manager.countBy(IndexDailyEntity, { tradeDate: date })) ===
        MARKET_INDEXES.length
    );
  }

  async aggregate(manager: EntityManager, date: string) {
    await this.stage(manager, 'market', date, async () => {
      const calendar = await manager.findOneBy(TradeCalEntity, {
        calDate: date,
        isOpen: 1,
      });
      if (
        !calendar ||
        !(await this.writes.rawReady(manager, date)) ||
        !(await this.writes.rawReady(manager, calendar.preTradeDate))
      )
        throw new Error('当日或前一交易日原始数据尚未完整');
      if (
        (await manager.countBy(IndexDailyEntity, { tradeDate: date })) !==
        MARKET_INDEXES.length
      )
        throw new Error('指数尚未完整');
      const daily = await manager.findBy(DailyEntity, { tradeDate: date });
      const limits = await manager.findBy(LimitEntity, { tradeDate: date });
      const previous = await manager.findBy(DailyEntity, {
        tradeDate: calendar.preTradeDate,
      });
      const previousLimits = await manager.findBy(LimitEntity, {
        tradeDate: calendar.preTradeDate,
      });
      const mapping = await manager.find(BseMappingEntity);
      const map = new Map(mapping.map((r) => [r.oldCode, r.newCode]));
      const rows = MARKET_SCOPES.map((scope) => ({
        tradeDate: date,
        scope,
        data: marketStats(
          scope,
          daily,
          limits,
          previous,
          previousLimits,
          (c) => map.get(c) || c,
        ),
      }));
      await manager.transaction((tx) =>
        tx
          .createQueryBuilder()
          .insert()
          .into(MarketDailyEntity)
          .values(rows)
          .orUpdate(['data'], ['trade_date', 'scope'])
          .updateEntity(false)
          .execute(),
      );
    });
  }

  async invalidate(manager: EntityManager, date: string) {
    const next = await manager.findOneBy(TradeCalEntity, {
      preTradeDate: date,
      isOpen: 1,
    });
    for (const day of [date, next?.calDate].filter(Boolean)) {
      await manager.delete(MarketDailyEntity, { tradeDate: day });
      await manager.update(
        SyncRunEntity,
        { task: 'market', tradeDate: day },
        { status: 'pending', error: '原始数据更新，等待重算' },
      );
    }
  }

  async enqueueBackfill(manager: EntityManager, end: string) {
    const start = dayjs(end).subtract(2, 'year').format('YYYY-MM-DD');
    const existing = await manager.query(
      "SELECT id,status FROM t_admin_job WHERE mode='missing' AND actor_id IS NULL AND start_date<=? AND end_date>=? AND status IN ('queued','running','success','pending','failed') ORDER BY id DESC LIMIT 1",
      [start, end],
    );
    if (existing.length && existing[0].status !== 'success') return;
    if (existing.length) {
      const holes = await manager.query(
        "SELECT c.cal_date FROM t_source_trade_cal c LEFT JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='market' AND r.status='success' LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date WHERE c.is_open=1 AND c.cal_date BETWEEN ? AND ? AND r.id IS NULL AND p.trade_date IS NULL LIMIT 1",
        [start, end],
      );
      if (!holes.length) return;
    }
    await manager.query(
      "INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES (NULL,'系统补齐',?,?,'queued','market-two-years','missing','等待补齐最近两年') ON DUPLICATE KEY UPDATE end_date=GREATEST(end_date,VALUES(end_date))",
      [start, end],
    );
  }

  async pendingDates(manager: EntityManager, start: string, end: string) {
    const dates = await manager.find(TradeCalEntity, {
      where: { calDate: Between(start, end), isOpen: 1 },
      order: { calDate: 'ASC' },
    });
    const done = new Set(
      (
        await manager.findBy(SyncRunEntity, {
          task: 'market',
          status: 'success',
          tradeDate: Between(start, end),
        })
      ).map((r) => r.tradeDate),
    );
    return dates.filter((r) => !done.has(r.calDate));
  }
}
