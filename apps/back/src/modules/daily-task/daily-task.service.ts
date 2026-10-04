import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { MarketSyncService } from '@/modules/analysis/market/market-sync.service';
import { MarketBreadthService } from '@/modules/analysis/market/market-breadth.service';
import { SectorService } from '@/modules/analysis/market/sector.service';
import {
  MarketDailyEntity,
  IndexDailyEntity,
  BseMappingEntity,
} from '@/modules/analysis/market/market.entity';
import {
  Between,
  DataSource,
  EntityManager,
  EntityTarget,
  ObjectLiteral,
} from 'typeorm';
import { BizException } from '@/exceptions/biz.exception';
import { ECustomError } from '@/types/common.enum';
import { SyncWriteService } from './sync-write.service';
import { SyncDayPolicyEntity } from './sync-day-policy.entity';
import { DailyEntity } from '../source/daily/daily.entity';
import { LimitEntity } from '../source/limit/limit.entity';
import { StockEntity } from '../source/stock/stock.entity';
import { StockIdentityService } from '../source/stock/stock-identity.service';
import { TrendService } from '../strategy/trend.service';
import { InsightService } from '../strategy/insight.service';
import { TradeCalEntity } from '../source/trade-cal/trade-cal.entity';
import { ActiveFundsEntity } from '../source/active-funds/active-funds.entity';
import { SentiEntity } from '../processed/senti/senti.entity';
import { SyncRunEntity, SyncStatus } from './sync-run.entity';
import { SyncSourceService } from './sync-source.service';
import {
  errorMessage,
  normalizeDate,
  shanghaiDate,
  latestSyncDate,
  eveningSlot,
  permanentSyncError,
} from './sync.utils';

@Injectable()
export class DailyTaskService {
  get marketEnabled() {
    return !!this.market;
  }

  private readonly logger = new Logger(DailyTaskService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly source: SyncSourceService,
    private readonly writes: SyncWriteService,
    @Optional() private readonly market?: MarketSyncService,
    @Optional() private readonly breadth?: MarketBreadthService,
    @Optional() private readonly sectors?: SectorService,
    @Optional() private readonly identity?: StockIdentityService,
    @Optional() private readonly trends?: TrendService,
    @Optional() private readonly insights?: InsightService,
  ) {}

  private withLock<T>(
    action: (manager: EntityManager) => Promise<T>,
    skipBusy = false,
  ) {
    return this.writes.withLock(action, skipBusy);
  }

  private async beginRun(manager: EntityManager, task: string, date: string) {
    const repo = manager.getRepository(SyncRunEntity);
    const previous = await repo.findOneBy({ task, tradeDate: date });
    return repo.save(
      repo.create({
        ...previous,
        task,
        tradeDate: date,
        status: 'running',
        attempts: (previous?.attempts || 0) + 1,
        error: null,
        updatedAt: new Date(),
      }),
    );
  }

  private async failRun(
    manager: EntityManager,
    run: SyncRunEntity,
    error: unknown,
  ) {
    await manager.update(SyncRunEntity, run.id, {
      status: 'failed',
      error: errorMessage(error).slice(0, 4000),
      updatedAt: new Date(),
    });
  }

  private async insertRows<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    rows: T[],
  ) {
    for (let offset = 0; offset < rows.length; offset += 500) {
      // eslint-disable-next-line no-await-in-loop
      await manager
        .getRepository(entity)
        .insert(rows.slice(offset, offset + 500));
    }
  }

  private async replaceSnapshot<T extends ObjectLiteral>(
    manager: EntityManager,
    entity: EntityTarget<T>,
    fetch: () => Promise<T[]>,
  ) {
    const rows = await fetch();
    const oldCount = await manager.count(entity);
    if (!rows.length || (oldCount > 0 && rows.length < oldCount * 0.8))
      throw new Error('快照为空或数量下降超过 20%，保留原数据并等待核查');
    await manager.transaction(async (tx) => {
      await tx.getRepository(entity).createQueryBuilder().delete().execute();
      await this.insertRows(tx, entity, rows);
    });
  }

  private async refreshSources(
    manager: EntityManager,
    manual = false,
    auxiliary = true,
  ) {
    const date = shanghaiDate();
    await this.replaceSnapshot(manager, TradeCalEntity, () =>
      this.source.calendar(Number(date.slice(0, 4))),
    );
    await this.replaceSnapshot(manager, StockEntity, () =>
      this.source.stocks(),
    );
    if (this.identity) {
      try {
        await this.identity.refresh(
          manager,
          await manager.find(StockEntity),
          manual,
        );
      } catch (error) {
        this.logger.error(
          `股票历史信息同步失败，策略将提示数据未就绪: ${errorMessage(error)}`,
        );
      }
    }
    if (!auxiliary) return;
    await this.refreshAuxiliary(manager, date, manual);
  }

  private async refreshAuxiliary(
    manager: EntityManager,
    date: string,
    manual = false,
  ) {
    const previous = await manager.findOneBy(SyncRunEntity, {
      task: 'active-funds',
      tradeDate: date,
    });
    if (!manual && previous?.status === 'success') return;
    if (
      !manual &&
      previous?.status === 'failed' &&
      permanentSyncError(previous.error || '')
    ) {
      this.logger.log('游资名录当日永久错误，跳过自动补试并保留旧数据');
      return;
    }
    const run = await this.beginRun(manager, 'active-funds', date);
    try {
      await this.replaceSnapshot(manager, ActiveFundsEntity, () =>
        this.source.activeFunds(),
      );
      await manager.update(SyncRunEntity, run.id, {
        status: 'success',
        error: null,
      });
    } catch (error) {
      await this.failRun(manager, run, error);
      this.logger.error(
        `游资名录更新失败，保留旧数据并继续行情同步: ${errorMessage(error)}`,
      );
    }
  }

  private rawReady(manager: EntityManager, date: string) {
    return this.writes.rawReady(manager, date);
  }

  private writeMood(manager: EntityManager, date: string) {
    return this.writes.writeMood(manager, date);
  }

  private async repairNextMood(manager: EntityManager, date: string) {
    const next = await manager.findOne(TradeCalEntity, {
      where: { preTradeDate: date, isOpen: 1 },
      order: { calDate: 'ASC' },
    });
    if (!next || !(await this.rawReady(manager, next.calDate))) return;
    if (await this.writeMood(manager, next.calDate)) {
      await manager.update(
        SyncRunEntity,
        { task: 'daily', tradeDate: next.calDate },
        { status: 'success', sentiCount: 1, error: null },
      );
    }
  }

  private async importDay(
    manager: EntityManager,
    date: string,
    includePrevious = true,
    manual = false,
    force = false,
  ) {
    if (!manual && (await this.writes.excluded(manager, date))) return;
    const calendar = await manager.findOneBy(TradeCalEntity, {
      calDate: date,
      isOpen: 1,
    });
    if (!calendar) throw new BizException(ECustomError.NON_TRADING_DAY);
    if (date > shanghaiDate())
      throw new ConflictException('不能导入未来的交易日');
    if (
      includePrevious &&
      !(await this.writes.excluded(manager, calendar.preTradeDate)) &&
      calendar.preTradeDate < date &&
      !(await this.rawReady(manager, calendar.preTradeDate))
    ) {
      const previous = await manager.findOneBy(TradeCalEntity, {
        calDate: calendar.preTradeDate,
        isOpen: 1,
      });
      if (previous) {
        try {
          await this.importDay(manager, previous.calDate, false);
        } catch (error) {
          if (permanentSyncError(error)) throw error;
          this.logger.warn(
            `前一交易日导入失败，情绪指标将等待补算: ${errorMessage(error)}`,
          );
        }
      }
    }
    const existingRun = await manager.findOneBy(SyncRunEntity, {
      task: 'daily',
      tradeDate: date,
    });
    if (
      !manual &&
      !force &&
      existingRun &&
      (await this.rawReady(manager, date))
    ) {
      await manager.transaction(async (tx) => {
        const ready = await this.writeMood(tx, date);
        await tx.update(SyncRunEntity, existingRun.id, {
          status: ready ? 'success' : 'pending',
          sentiCount: ready ? 1 : 0,
          error: ready ? null : '前置数据不足或受主动删除保护，等待补算',
        });
        await this.repairNextMood(tx, date);
      });
      return;
    }
    const run = await this.beginRun(manager, 'daily', date);
    try {
      // 所有外部请求在事务外完成，事务只包含数据库操作。
      const stocks = await manager.find(StockEntity);
      const sourceDaily = await this.source.daily(date, stocks);
      const daily = this.identity
        ? await this.identity.decorate(sourceDaily, manager)
        : sourceDaily;
      const limits = await this.source.limits(date);
      const oldCount = await manager.countBy(DailyEntity, { tradeDate: date });
      if (!daily.length || (oldCount > 0 && daily.length < oldCount * 0.8))
        throw new Error('日线快照数量异常，保留原数据');
      await manager.transaction(async (tx) => {
        if (this.market) await this.market.invalidate(tx, date);
        if (manual) await tx.delete(SyncDayPolicyEntity, { tradeDate: date });
        await tx.delete(DailyEntity, { tradeDate: date });
        await tx.delete(LimitEntity, { tradeDate: date });
        await tx.delete(SentiEntity, { tradeDate: date });
        await this.insertRows(tx, DailyEntity, daily);
        await this.insertRows(tx, LimitEntity, limits);
        const moodReady = await this.writeMood(tx, date);
        await tx.update(SyncRunEntity, run.id, {
          status: moodReady ? 'success' : 'pending',
          dailyCount: daily.length,
          limitCount: limits.length,
          sentiCount: moodReady ? 1 : 0,
          error: moodReady ? null : '等待前一交易日数据，情绪指标尚未计算',
        });
        await this.repairNextMood(tx, date);
      });
    } catch (error) {
      await this.failRun(manager, run, error);
      throw error;
    }
    this.logger.log(`${date}行情已同步`);
  }

  async import(date: string) {
    normalizeDate(date);
    await this.withLock(async (manager) => {
      await this.refreshSources(manager, true);
      await this.importDay(manager, date, true, true);
    });
  }

  async bulkImport(
    startDate: string,
    endDate: string,
    progress: (date: string) => Promise<void> = async () => {},
  ) {
    this.checkRange(startDate, endDate);
    await this.withLock(async (manager) => {
      await this.refreshSources(manager, true);
      const days = await manager.find(TradeCalEntity, {
        where: { calDate: Between(startDate, endDate), isOpen: 1 },
        order: { calDate: 'ASC' },
      });
      // eslint-disable-next-line no-restricted-syntax
      for (const day of days) {
        // eslint-disable-next-line no-await-in-loop
        await this.importDay(manager, day.calDate, true, true);
        // eslint-disable-next-line no-await-in-loop
        await progress(day.calDate);
      }
    });
  }

  private checkRange(startDate: string, endDate: string) {
    normalizeDate(startDate);
    normalizeDate(endDate);
    if (startDate > endDate)
      throw new ConflictException('开始日期不能晚于结束日期');
  }

  // 启动补同步与每日北京时间 20:30 共用入口。
  async catchUp(now = new Date(), scheduled = false) {
    if (this.market) return this.catchUpMarket(now, scheduled);
    return this.withLock(async (manager) => {
      const slot = eveningSlot(now);
      if (scheduled && !slot) return 'skipped';
      const task = `auto-${slot || 'startup'}`;
      const today = shanghaiDate(now);
      const earlierRuns = await manager.findBy(SyncRunEntity, {
        tradeDate: today,
      });
      if (
        scheduled &&
        earlierRuns.some(
          (run) =>
            run.task.startsWith('auto-') &&
            (run.task === task ||
              run.status === 'success' ||
              run.error?.startsWith('permanent:')),
        )
      )
        return 'skipped';
      const cycle = scheduled
        ? await this.beginRun(manager, task, today)
        : undefined;
      try {
        await this.refreshSources(manager);
        const cutoff = latestSyncDate(now);
        const days = (
          await manager.find(TradeCalEntity, {
            where: { isOpen: 1 },
            order: { calDate: 'ASC' },
          })
        ).filter((day) => day.calDate <= cutoff);
        if (!days.length) {
          if (cycle)
            await manager.update(SyncRunEntity, cycle.id, {
              status: 'success',
            });
          return 'success';
        }
        // 固定补同步起点，避免情绪指标的前置日期使范围不断向过去扩张。
        const scope = await manager.findOne(SyncRunEntity, {
          where: { task: 'scope' },
          order: { tradeDate: 'ASC' },
        });
        const startDate = normalizeDate(
          process.env.SYNC_START_DATE ||
            scope?.tradeDate ||
            days[Math.max(0, days.length - 30)].calDate,
        );
        if (!scope)
          await manager.save(SyncRunEntity, {
            task: 'scope',
            tradeDate: startDate,
            status: 'success',
            attempts: 0,
            error: null,
          });
        const maxDays = Number(process.env.SYNC_MAX_DAYS_PER_RUN || 3);
        if (!Number.isInteger(maxDays) || maxDays < 1)
          throw new Error('SYNC_MAX_DAYS_PER_RUN 必须为正整数');
        const completeDates = await this.completeDates(
          manager,
          startDate,
          cutoff,
        );
        const excluded = new Set(
          (await manager.find(SyncDayPolicyEntity)).map((row) => row.tradeDate),
        );
        const missingDays = days.filter(
          (item) =>
            item.calDate >= startDate &&
            !excluded.has(item.calDate) &&
            !completeDates.has(item.calDate),
        );
        // 保留最新交易日的处理机会，历史失败或大量积压不能阻断每日更新。
        const selectedDays =
          missingDays.length > maxDays
            ? [
                missingDays[missingDays.length - 1],
                ...missingDays.slice(0, maxDays - 1),
              ]
            : missingDays;
        if (missingDays.length > selectedDays.length)
          this.logger.log('达到本次补同步日期上限，剩余日期下次继续');
        const failures: string[] = [];
        let permanentFailure = false;
        // eslint-disable-next-line no-restricted-syntax
        for (const day of selectedDays) {
          // eslint-disable-next-line no-await-in-loop
          const complete = await this.isComplete(manager, day.calDate);
          if (!complete) {
            try {
              // eslint-disable-next-line no-await-in-loop
              await this.importDay(manager, day.calDate);
              // eslint-disable-next-line no-await-in-loop
              if (!(await this.isComplete(manager, day.calDate)))
                failures.push(day.calDate);
            } catch (error) {
              permanentFailure ||= permanentSyncError(error);
              failures.push(day.calDate);
              this.logger.error(
                `${day.calDate}补同步失败: ${errorMessage(error)}`,
              );
              if (permanentFailure) break;
            }
          }
        }
        if (failures.length)
          throw new Error(
            `${
              permanentFailure ? 'permanent:' : ''
            }以下交易日同步未完成，下次重试: ${failures.join(', ')}`,
          );
        if (cycle)
          await manager.update(SyncRunEntity, cycle.id, {
            status:
              missingDays.length > selectedDays.length ? 'pending' : 'success',
            error: null,
          });
        return missingDays.length > selectedDays.length ? 'pending' : 'success';
      } catch (error) {
        if (cycle)
          await manager.update(SyncRunEntity, cycle.id, {
            status: 'failed',
            error: `${
              permanentSyncError(error) ? 'permanent:' : ''
            }${errorMessage(error)}`.slice(0, 4000),
          });
        throw error;
      }
    }, true);
  }

  /** 所有入口复用同一批处理流程；每批最多三个交易日，释放写锁后续跑。 */
  async marketBatch(
    start: string,
    end: string,
    force = false,
    excludedDates: string[] = [],
    now = new Date(),
  ) {
    if (!this.market) throw new Error('市场分析模块未启用');
    this.checkRange(start, end);
    return this.writes.withLock(
      async (manager) => {
        const today = shanghaiDate(now);
        const reference = await manager.findOneBy(SyncRunEntity, {
          task: 'market-reference',
          tradeDate: today,
          status: 'success',
        });
        if (!reference) {
          await this.market!.stage(
            manager,
            'market-reference',
            today,
            async () => {
              await this.refreshSources(manager, false, false);
              await this.market!.mapping(manager, today);
            },
          );
        }
        const expected = await manager.findOne(TradeCalEntity, {
          where: { isOpen: 1 },
          order: { calDate: 'DESC' },
        });
        // 截止日期由交易日历和盘后窗口共同决定，不允许任务读取未来行情。
        const days = (
          await manager.find(TradeCalEntity, {
            where: { isOpen: 1, calDate: Between(start, end) },
            order: { calDate: 'ASC' },
          })
        ).filter((d) => d.calDate <= latestSyncDate(now));
        const protections = new Set(
          (await manager.find(SyncDayPolicyEntity)).map((r) => r.tradeDate),
        );
        const success = new Set(
          (
            await manager.findBy(SyncRunEntity, {
              task: 'market',
              status: 'success',
              tradeDate: Between(start, end),
            })
          ).map((r) => r.tradeDate),
        );
        const pending = days.filter(
          (d) =>
            !protections.has(d.calDate) &&
            !(excludedDates.includes(d.calDate) && success.has(d.calDate)) &&
            (force || !success.has(d.calDate)),
        );
        const latest = (
          await manager.find(TradeCalEntity, {
            where: { isOpen: 1 },
            order: { calDate: 'DESC' },
          })
        ).find((d) => d.calDate <= latestSyncDate(now));
        const priority =
          latest &&
          !protections.has(latest.calDate) &&
          !(await this.market!.complete(manager, latest.calDate))
            ? latest
            : undefined;
        const selected = [
          ...(priority ? [priority] : []),
          ...pending.filter((r) => r.calDate !== priority?.calDate),
        ].slice(0, 3);
        const completed: string[] = [];
        const failures: string[] = [];
        // eslint-disable-next-line no-restricted-syntax
        for (const day of selected) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await this.ensureMarketDay(
              manager,
              day.calDate,
              force && day.calDate >= start && day.calDate <= end,
            );
            completed.push(day.calDate);
          } catch (error) {
            failures.push(`${day.calDate}: ${errorMessage(error)}`);
            if (permanentSyncError(error)) break;
          }
        }
        // 游资名录等独立刷新不阻塞核心数据；失败后原有机制保留旧快照。
        await this.refreshAuxiliary(manager, today);
        const remaining = pending.filter(
          (r) => !completed.includes(r.calDate),
        ).length;
        return {
          completed,
          remaining,
          failures,
          protectedDates: days
            .filter((d) => protections.has(d.calDate))
            .map((d) => d.calDate),
          calendarReady: !!expected,
        };
      },
      true,
      true,
    );
  }

  async breadthBatch(start: string, end: string) {
    this.checkRange(start, end);
    if (!this.breadth) throw new Error('均线广度模块未启用');
    return this.breadth.batch(start, end);
  }

  async technicalBatch(start: string, end: string) {
    this.checkRange(start, end);
    if (!this.trends) throw new Error('趋势策略模块未启用');
    return this.trends.batch(start, end);
  }

  async insightBatch(start: string, end: string, hot = false) {
    return this.insights?.batch(start, end, hot);
  }

  async sectorBatch(start: string, end: string) {
    this.checkRange(start, end);
    if (!this.sectors) throw new Error('同花顺板块模块未启用');
    return this.sectors.batch(start, end);
  }

  private async ensureMarketDay(
    manager: EntityManager,
    date: string,
    refresh: boolean,
  ) {
    const paused = await manager.findBy(SyncRunEntity, {
      tradeDate: date,
      status: 'failed',
    });
    const blocked = paused.find(
      (r) =>
        ['daily', 'market-index'].includes(r.task) &&
        permanentSyncError(r.error || '') &&
        shanghaiDate(r.updatedAt) === shanghaiDate(),
    );
    if (blocked) throw new Error(blocked.error || '数据源权限或配额错误');
    const cal = await manager.findOneBy(TradeCalEntity, {
      calDate: date,
      isOpen: 1,
    });
    if (!cal) throw new Error('非交易日');
    if (await this.writes.excluded(manager, cal.preTradeDate))
      throw new Error('前一交易日受主动删除保护');
    if (!(await this.rawReady(manager, cal.preTradeDate)))
      await this.importDay(manager, cal.preTradeDate, false);
    if (refresh || !(await this.rawReady(manager, date)))
      await this.importDay(manager, date, false, false, refresh);
    else {
      const ready = await this.writeMood(manager, date);
      const existing = await manager.findOneBy(SyncRunEntity, {
        task: 'daily',
        tradeDate: date,
      });
      await manager.save(SyncRunEntity, {
        ...existing,
        task: 'daily',
        tradeDate: date,
        status: ready ? 'success' : 'pending',
        dailyCount: await manager.countBy(DailyEntity, { tradeDate: date }),
        limitCount: await manager.countBy(LimitEntity, { tradeDate: date }),
        sentiCount: ready ? 1 : 0,
        error: null,
      });
    }
    // 在指数刷新和汇总提交前，先撤下该日旧的可用标记。
    await manager.update(
      SyncRunEntity,
      { task: 'market', tradeDate: date },
      { status: 'pending', error: null },
    );
    await this.market!.indexes(manager, date, refresh);
    await this.market!.aggregate(manager, date);
    // 广度在独立任务采集；技术因子的网络延迟不会拖住核心行情批次。
    if (this.breadth) {
      try {
        await this.breadth.enqueue(manager, date);
      } catch (error) {
        this.logger.warn(`均线广度 ${date}: ${errorMessage(error)}`);
      }
    }
    try {
      await this.sectors?.enqueue(manager, date);
    } catch (error) {
      this.logger.warn(`同花顺板块 ${date}: ${errorMessage(error)}`);
    }
    try {
      await this.trends?.enqueue(manager, date);
      await this.insights?.enqueue(manager, date);
    } catch (e) {
      this.logger.warn(`策略复权行情补齐排队失败: ${e.message}`);
    }
    const next = await manager.findOneBy(TradeCalEntity, {
      preTradeDate: date,
      isOpen: 1,
    });
    if (
      next &&
      (await this.rawReady(manager, next.calDate)) &&
      (await manager.findOneBy(SyncRunEntity, {
        task: 'market-index',
        tradeDate: next.calDate,
        status: 'success',
      }))
    ) {
      await this.market!.aggregate(manager, next.calDate);
    }
  }

  private async catchUpMarket(now: Date, scheduled: boolean) {
    const slot = eveningSlot(now);
    if (scheduled && !slot) return 'skipped';
    const cutoff = latestSyncDate(now);
    // 基础资料可能尚未初始化，先在同一锁内准备，网络请求仍在事务之外。
    await this.writes.withLock(
      async (manager) => {
        if (!(await manager.count(TradeCalEntity)))
          await this.refreshSources(manager, false, false);
        const days = await manager.find(TradeCalEntity, {
          where: { isOpen: 1 },
          order: { calDate: 'DESC' },
        });
        const last = days.find((d) => d.calDate <= cutoff);
        if (last) {
          await this.market!.enqueueBackfill(manager, last.calDate);
          await this.breadth?.enqueue(manager, last.calDate);
          await this.sectors?.enqueue(manager, last.calDate);
          await this.trends?.enqueue(manager, last.calDate);
          await this.insights?.enqueue(manager, last.calDate);
        }
      },
      true,
      true,
    );
    const dateRows = await this.dataSource.manager.find(TradeCalEntity, {
      where: { isOpen: 1 },
      order: { calDate: 'DESC' },
    });
    const last = dateRows.find((d) => d.calDate <= cutoff);
    if (!last) return 'pending';
    const refresh = slot === '2200' || slot === '0730';
    const task = `market-auto-${slot || 'startup'}`;
    const old = await this.dataSource.manager.findOneBy(SyncRunEntity, {
      task,
      tradeDate: shanghaiDate(now),
    });
    if (old?.status === 'success') return 'skipped';
    if (refresh) {
      // 核对任务先落库，避免恰逢历史批次持锁而错过22:00/07:30入口。
      await this.dataSource.query(
        "INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,'系统核对',?,?,'queued',?,'refresh','等待核对最近交易日') ON DUPLICATE KEY UPDATE id=id",
        [
          last.calDate,
          last.calDate,
          `market-check-${shanghaiDate(now)}-${slot}`,
        ],
      );
      await this.dataSource.manager.save(SyncRunEntity, {
        ...old,
        task,
        tradeDate: shanghaiDate(now),
        status: 'success',
        attempts: (old?.attempts || 0) + 1,
        error: null,
        updatedAt: new Date(),
      });
      return 'pending';
    }
    const result = await this.marketBatch(
      last.calDate,
      last.calDate,
      refresh,
      [],
      now,
    );
    if (!result) return 'skipped';
    let status: SyncStatus = result.remaining ? 'pending' : 'success';
    if (result.failures.length) status = 'failed';
    await this.dataSource.manager.upsert(
      SyncRunEntity,
      {
        task,
        tradeDate: shanghaiDate(now),
        status,
        attempts: (old?.attempts || 0) + 1,
        error: result.failures.join('\n') || null,
      },
      ['task', 'tradeDate'],
    );
    return status;
  }

  private async completeDates(
    manager: EntityManager,
    start: string,
    end: string,
  ) {
    // 使用分组计数规划补同步，避免对多年历史逐日执行数千次查询。
    const counts = async (
      entity: EntityTarget<DailyEntity | LimitEntity | SentiEntity>,
    ) => {
      const rows = await manager
        .getRepository(entity)
        .createQueryBuilder('item')
        .select("DATE_FORMAT(item.tradeDate, '%Y-%m-%d')", 'date')
        .addSelect('COUNT(*)', 'count')
        .where('item.tradeDate BETWEEN :start AND :end', { start, end })
        .groupBy('item.tradeDate')
        .getRawMany<{ date: string; count: string }>();
      return new Map(rows.map((row) => [row.date, Number(row.count)]));
    };
    // 同一连接上顺序执行。
    const daily = await counts(DailyEntity);
    const limits = await counts(LimitEntity);
    const senti = await counts(SentiEntity);
    const runs = await manager.findBy(SyncRunEntity, {
      task: 'daily',
      tradeDate: Between(start, end),
    });
    const byDate = new Map(runs.map((run) => [run.tradeDate, run]));
    return new Set(
      [...daily.keys()].filter((date) => {
        const run = byDate.get(date);
        return (
          senti.get(date) === 1 &&
          (run
            ? run.status === 'success' &&
              run.dailyCount === daily.get(date) &&
              run.limitCount === (limits.get(date) || 0)
            : (limits.get(date) || 0) > 0)
        );
      }),
    );
  }

  private async isComplete(manager: EntityManager, date: string) {
    const run = await manager.findOneBy(SyncRunEntity, {
      task: 'daily',
      tradeDate: date,
    });
    const sentiCount = await manager.countBy(SentiEntity, { tradeDate: date });
    const ready = await this.rawReady(manager, date);
    return (!run || run.status === 'success') && sentiCount === 1 && ready;
  }

  private async deleteDay(manager: EntityManager, date: string) {
    await manager.transaction(async (tx) => {
      if (this.market) await this.market.invalidate(tx, date);
      await this.writes.exclude(tx, [date]);
      await tx.delete(DailyEntity, { tradeDate: date });
      await tx.delete(LimitEntity, { tradeDate: date });
      await tx.delete(SentiEntity, { tradeDate: date });
      await tx.delete(SyncRunEntity, { task: 'daily', tradeDate: date });
      const next = await tx.findOne(TradeCalEntity, {
        where: { preTradeDate: date, isOpen: 1 },
        order: { calDate: 'ASC' },
      });
      if (next) {
        await tx.delete(SentiEntity, { tradeDate: next.calDate });
        await tx.update(
          SyncRunEntity,
          { task: 'daily', tradeDate: next.calDate },
          {
            status: 'pending',
            sentiCount: 0,
            error: '前一交易日数据被删除，等待补算',
          },
        );
      }
      await this.writes.markChanged(tx);
    });
  }

  async delete(date: string) {
    normalizeDate(date);
    await this.withLock(async (manager) => {
      if (
        !(await manager.findOneBy(TradeCalEntity, { calDate: date, isOpen: 1 }))
      )
        throw new BizException(ECustomError.NON_TRADING_DAY);
      await this.deleteDay(manager, date);
    });
  }

  async bulkDelete(startDate: string, endDate: string) {
    this.checkRange(startDate, endDate);
    await this.withLock(async (manager) => {
      const days = await manager.findBy(TradeCalEntity, {
        calDate: Between(startDate, endDate),
        isOpen: 1,
      });
      // eslint-disable-next-line no-restricted-syntax
      for (const day of days) {
        // eslint-disable-next-line no-await-in-loop
        await this.deleteDay(manager, day.calDate);
      }
    });
  }

  async clear() {
    await this.withLock((manager) =>
      manager.transaction(async (tx) => {
        if (this.market) {
          await tx.delete(MarketDailyEntity, {});
          await tx.delete(IndexDailyEntity, {});
          await tx.delete(BseMappingEntity, {});
        }
        const dates = await tx.query(
          'SELECT trade_date AS date FROM t_source_daily UNION SELECT trade_date FROM t_source_limit UNION SELECT trade_date FROM t_processed_senti UNION SELECT cal_date FROM t_source_trade_cal WHERE is_open=1 AND cal_date<=CURDATE()',
        );
        await this.writes.exclude(
          tx,
          dates.map((row: { date: Date | string }) =>
            typeof row.date === 'string'
              ? row.date
              : row.date.toISOString().slice(0, 10),
          ),
        );
        // eslint-disable-next-line no-restricted-syntax
        for (const entity of [
          SentiEntity,
          LimitEntity,
          DailyEntity,
          StockEntity,
          ActiveFundsEntity,
          TradeCalEntity,
          SyncRunEntity,
        ]) {
          // eslint-disable-next-line no-await-in-loop
          await tx.createQueryBuilder().delete().from(entity).execute();
        }
        await this.writes.markChanged(tx);
      }),
    );
  }
}
