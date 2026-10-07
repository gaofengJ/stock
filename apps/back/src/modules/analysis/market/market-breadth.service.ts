/* eslint-disable no-await-in-loop, no-restricted-syntax -- 按日串行采集，遵守数据源30次/分钟限制。 */
import { Injectable } from '@nestjs/common';
import { Between, DataSource, EntityManager, LessThanOrEqual } from 'typeorm';
import * as dayjs from 'dayjs';
import { TushareService } from '@/shared/tushare/tushare.service';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { readSnapshot } from '@/modules/daily-task/sync-source.service';
import {
  latestSyncDate,
  normalizeDate,
  automaticSyncRetryBlocked,
  permanentSyncError,
} from '@/modules/daily-task/sync.utils';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { StockEntity } from '@/modules/source/stock/stock.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { BseMappingEntity, MarketBreadthEntity } from './market.entity';
import { MARKET_SCOPES } from './market.constants';
import { MarketSyncService } from './market-sync.service';
import { MarketQueryDto } from './market.dto';
import { BreadthFactor, marketBreadth } from './market-environment.utils';

@Injectable()
export class MarketBreadthService {
  constructor(
    private db: DataSource,
    private source: TushareService,
    private writes: SyncWriteService,
    private sync: MarketSyncService,
  ) {}

  async syncDay(manager: EntityManager, date: string, refresh = false) {
    if (
      !refresh &&
      (await manager.countBy(MarketBreadthEntity, { tradeDate: date })) ===
        MARKET_SCOPES.length
    )
      return;
    if (await this.writes.excluded(manager, date))
      throw new Error('该日受主动删除保护');
    if (!(await this.sync.complete(manager, date)))
      throw new Error('等待当日大盘数据完整');
    const last = await manager.findOne(SyncRunEntity, {
      where: { task: 'market-breadth' },
      order: { updatedAt: 'DESC' },
    });
    await this.sync.stage(manager, 'market-breadth', date, async () => {
      // 同步锁与持久化阶段时间共同限流，重启/多进程仍遵守30次/分钟。
      const wait = (last?.updatedAt.getTime() || 0) + 2100 - Date.now();
      if (wait > 0)
        await new Promise((resolve) => {
          setTimeout(resolve, wait);
        });
      const response = await this.source.queryData(
        'stk_factor_pro',
        {
          trade_date: date.replace(/-/g, ''),
        },
        'ts_code,trade_date,close_hfq,ma_hfq_20,ma_hfq_60',
        10000,
      );
      if (
        !['ma_hfq_20', 'ma_hfq_60'].every(
          (key) => response.data?.fields?.includes(key),
        )
      )
        throw new Error('均线接口缺少必需字段');
      const raw = readSnapshot(response, [
        'ts_code',
        'trade_date',
        'close_hfq',
      ]);
      const mapping = new Map(
        (await manager.find(BseMappingEntity)).map((r) => [
          r.oldCode,
          r.newCode,
        ]),
      );
      const canonical = (code: string) => mapping.get(code) || code;
      const sourceCodes = new Set(raw.map((r) => r.tsCode));
      if (sourceCodes.size !== raw.length) throw new Error('均线数据代码重复');
      const factorsByCode = new Map<string, BreadthFactor>();
      raw.forEach((r) => {
        if (r.tradeDate !== date.replace(/-/g, ''))
          throw new Error('均线数据日期不匹配');
        const tsCode = canonical(r.tsCode);
        // 新代码的整条后复权记录为准，不比较或混用旧代码的复权基点。
        // 历史日期仅返回旧代码时保留完整旧记录，仍按映射后的代码只计一次。
        if (r.tsCode !== tsCode && sourceCodes.has(tsCode)) return;
        if (factorsByCode.has(tsCode)) throw new Error('北交所代码映射冲突');
        factorsByCode.set(tsCode, { ...r, tsCode } as BreadthFactor);
      });
      const factors = [...factorsByCode.values()];
      if (
        (['maHfq20', 'maHfq60'] as const).some(
          (key) =>
            !factors.some(
              (r) => Number.isFinite(Number(r[key])) && Number(r[key]) > 0,
            ),
        )
      )
        throw new Error('均线接口整列为空或无效');
      const dailyByCode = new Map<
        string,
        { tsCode: string; amount: DailyEntity['amount'] }
      >();
      (
        await manager.find(DailyEntity, {
          where: { tradeDate: date },
          select: { tsCode: true, amount: true },
        })
      ).forEach((r) => {
        const tsCode = canonical(r.tsCode);
        const previous = dailyByCode.get(tsCode);
        if (previous && Number(previous.amount) !== Number(r.amount))
          throw new Error('北交所新旧代码成交额冲突');
        dailyByCode.set(tsCode, { tsCode, amount: r.amount });
      });
      const daily = [...dailyByCode.values()];
      const stocks = await manager.find(StockEntity, {
        select: { tsCode: true, listDate: true },
      });
      const listingDates = new Map(
        stocks.map((r) => [canonical(r.tsCode), r.listDate]),
      );
      const calendar = await manager.find(TradeCalEntity, {
        where: { isOpen: 1, calDate: LessThanOrEqual(date) },
        order: { calDate: 'DESC' },
        take: 60,
      });
      const cutoffs = {
        ma20: calendar[19]?.calDate || null,
        ma60: calendar[59]?.calDate || null,
      };
      if (!cutoffs.ma60) throw new Error('均线计算所需交易日历不足60日');
      const summaries = MARKET_SCOPES.map((scope) => ({
        tradeDate: date,
        scope,
        data: marketBreadth(daily, factors, scope, listingDates, cutoffs),
      }));
      // 少量无技术因子的股票明确披露；整日/整市场缺失时不发布误导性低覆盖结果。
      if (
        summaries.some(
          (r) =>
            r.data.total > 0 &&
            (r.data.ma20.missing / r.data.total > 0.05 ||
              r.data.ma60.missing / r.data.total > 0.05),
        )
      )
        throw new Error('均线数据覆盖不足95%，等待数据源补齐');
      await manager.transaction(async (tx) => {
        await tx.delete(MarketBreadthEntity, { tradeDate: date });
        await tx.insert(MarketBreadthEntity, summaries);
      });
    });
  }

  async enqueue(manager: EntityManager, end: string) {
    const start = dayjs(end).subtract(2, 'year').format('YYYY-MM-DD');
    const [hole] = await manager.query(
      `SELECT r.trade_date FROM t_sync_run r
      LEFT JOIN t_sync_day_policy p ON p.trade_date=r.trade_date
      WHERE r.task='market' AND r.status='success' AND r.trade_date BETWEEN ? AND ?
      AND p.trade_date IS NULL AND (SELECT COUNT(*) FROM t_processed_market_breadth b WHERE b.trade_date=r.trade_date)<6 LIMIT 1`,
      [start, end],
    );
    if (!hole) return;
    const [failed] = await manager.query(
      "SELECT error,updated_at updatedAt,DATE_FORMAT(end_date,'%Y-%m-%d') endDate FROM t_admin_job WHERE mode='breadth' AND actor_id IS NULL AND status='failed' ORDER BY id DESC LIMIT 1",
    );
    if (automaticSyncRetryBlocked(failed, end)) return;
    await manager.query(
      "INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,'均线广度补齐',?,?,'queued','market-breadth-two-years','breadth','等待补齐均线广度') ON DUPLICATE KEY UPDATE end_date=GREATEST(end_date,VALUES(end_date))",
      [start, end],
    );
  }

  async batch(start: string, end: string) {
    normalizeDate(start);
    normalizeDate(end);
    if (start > end) throw new Error('起止日期顺序错误');
    return this.writes.withLock(
      async (manager) => {
        const rows: { date: string; failed?: number }[] = await manager.query(
          `SELECT DATE_FORMAT(r.trade_date,'%Y-%m-%d') date,IF(s.status='failed',1,0) failed FROM t_sync_run r
        LEFT JOIN t_sync_day_policy p ON p.trade_date=r.trade_date
        LEFT JOIN t_sync_run s ON s.task='market-breadth' AND s.trade_date=r.trade_date
        WHERE r.task='market' AND r.status='success' AND r.trade_date BETWEEN ? AND ? AND p.trade_date IS NULL
        AND (SELECT COUNT(*) FROM t_processed_market_breadth b WHERE b.trade_date=r.trade_date)<6 ORDER BY r.trade_date DESC`,
          [start, end < latestSyncDate() ? end : latestSyncDate()],
        );
        const completed: string[] = [];
        const failures: string[] = [];
        // 历史异常不占满每个批次；新交易日和未尝试日期仍优先，最后再复核失败日。
        const selected = [...rows]
          .sort(
            (a, b) =>
              Number(a.failed || 0) - Number(b.failed || 0) ||
              b.date.localeCompare(a.date),
          )
          .slice(0, 3);
        for (const row of selected) {
          try {
            await this.syncDay(manager, row.date);
            completed.push(row.date);
          } catch (e) {
            failures.push(`${row.date}: ${e.message}`);
            if (permanentSyncError(e)) break;
          }
        }
        return {
          completed,
          failures,
          remaining: rows.length - completed.length,
          protectedDates: [] as string[],
          calendarReady: true,
        };
      },
      true,
      true,
    );
  }

  async series(q: MarketQueryDto) {
    if (!q.date) return { date: null, snapshot: null, series: [], stage: null };
    normalizeDate(q.date);
    const calendar = await this.db.manager.find(TradeCalEntity, {
      where: {
        isOpen: 1,
        calDate: Between(
          dayjs(q.date).subtract(2, 'year').format('YYYY-MM-DD'),
          q.date,
        ),
      },
      order: { calDate: 'DESC' },
    });
    const visible = q.days === 730 ? calendar : calendar.slice(0, q.days);
    const rows: { date: string; data: MarketBreadthEntity['data'] | string }[] =
      await this.db.query(
        `SELECT DATE_FORMAT(b.trade_date,'%Y-%m-%d') date,b.data FROM t_processed_market_breadth b
      JOIN t_sync_run r ON r.trade_date=b.trade_date AND r.task='market' AND r.status='success'
      LEFT JOIN t_sync_day_policy p ON p.trade_date=b.trade_date
      WHERE b.scope=? AND b.trade_date BETWEEN ? AND ? AND p.trade_date IS NULL ORDER BY b.trade_date`,
        [q.scope, visible.at(-1)?.calDate || q.date, q.date],
      );
    const byDate = new Map(
      rows.map((r) => [
        r.date,
        typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
      ]),
    );
    const stage = await this.db.manager.findOneBy(SyncRunEntity, {
      task: 'market-breadth',
      tradeDate: q.date,
    });
    return {
      date: q.date,
      snapshot: byDate.get(q.date) || null,
      series: visible
        .slice()
        .reverse()
        .map((r) => ({ date: r.calDate, data: byDate.get(r.calDate) || null })),
      stage: stage ? { status: stage.status, error: stage.error } : null,
    };
  }
}
