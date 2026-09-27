import { BadRequestException, Injectable } from '@nestjs/common';
import { Between, DataSource, In, LessThanOrEqual } from 'typeorm';
import * as dayjs from 'dayjs';
import { createHash } from 'crypto';
import { TushareService } from '@/shared/tushare/tushare.service';
import { readSnapshot } from '@/modules/daily-task/sync-source.service';
import { normalizeDate, latestSyncDate } from '@/modules/daily-task/sync.utils';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import {
  BseMappingEntity,
  IndexDailyEntity,
  MarketDailyEntity,
} from './market.entity';
import { inScope, MARKET_INDEXES, MarketScope } from './market.constants';
import { MarketQueryDto } from './market.dto';
import { DragonCache } from './dragon-cache';

@Injectable()
export class MarketService {
  private dragonCache = new DragonCache<{
    summary: Record<string, unknown>[];
    seats: Record<string, unknown>[];
    queriedAt: string;
  }>();

  constructor(
    private db: DataSource,
    private tushare: TushareService,
  ) {}

  async status() {
    const rows: { date: string; updatedAt: Date }[] = await this.db.query(
      "SELECT DATE_FORMAT(r.trade_date,'%Y-%m-%d') date,r.updated_at updatedAt FROM t_sync_run r WHERE r.task='market' AND r.status='success' AND (SELECT COUNT(*) FROM t_processed_market_daily s WHERE s.trade_date=r.trade_date)=6 AND (SELECT COUNT(*) FROM t_source_index_daily i WHERE i.trade_date=r.trade_date)=8 ORDER BY r.trade_date DESC",
    );
    const expected = await this.db.manager.findOne(TradeCalEntity, {
      where: { isOpen: 1, calDate: LessThanOrEqual(latestSyncDate()) },
      order: { calDate: 'DESC' },
    });
    const stages = expected
      ? await this.db.manager.findBy(SyncRunEntity, {
          tradeDate: expected.calDate,
          task: In(['daily', 'market-index', 'market']),
        })
      : [];
    const [backfill] = await this.db.query(
      "SELECT id,status,stage,error FROM t_admin_job WHERE mode='missing' ORDER BY (actor_id IS NULL) DESC,(status IN ('queued','running','pending')) DESC,id DESC LIMIT 1",
    );
    return {
      latestDate: rows[0]?.date || null,
      dates: rows.map((r) => r.date),
      dateUpdates: Object.fromEntries(
        rows.map((r) => [r.date, r.updatedAt.toISOString()]),
      ),
      revision: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
      expectedDate: expected?.calDate || null,
      stages: stages.map((r) => ({
        task: r.task,
        status: r.status,
        updatedAt: r.updatedAt,
        error: r.error,
      })),
      backfill: backfill || null,
    };
  }

  async series(q: MarketQueryDto) {
    const status = await this.status();
    const date = q.date || status.latestDate;
    if (!date)
      return {
        status,
        date: null,
        snapshot: null,
        series: [],
        indexes: [],
        markets: [] as Array<
          MarketDailyEntity['data'] & { scope: MarketScope }
        >,
      };
    normalizeDate(date);
    const start = dayjs(date).subtract(2, 'year').format('YYYY-MM-DD');
    const calendar = await this.db.manager.find(TradeCalEntity, {
      where: { isOpen: 1, calDate: Between(start, date) },
      order: { calDate: 'DESC' },
    });
    const visible = q.days === 730 ? calendar : calendar.slice(0, q.days);
    const selected = new Set(visible.map((r) => r.calDate));
    const first =
      calendar[Math.min(calendar.length - 1, visible.length + 5)]?.calDate ||
      start;
    const data = await this.db.manager.find(MarketDailyEntity, {
      where: { scope: q.scope, tradeDate: Between(first, date) },
      order: { tradeDate: 'ASC' },
    });
    const ready = new Set(status.dates);
    const byDate = new Map(
      data
        .filter((r) => ready.has(r.tradeDate))
        .map((r) => [r.tradeDate, r.data]),
    );
    const snapshot = ready.has(date) ? byDate.get(date) || null : null;
    const priorDates = calendar.filter((r) => r.calDate < date).slice(0, 5);
    const previous = byDate.get(priorDates[0]?.calDate);
    const mean =
      priorDates.length === 5 && priorDates.every((r) => byDate.has(r.calDate))
        ? priorDates.reduce(
            (sum, r) => sum + byDate.get(r.calDate)!.amount,
            0,
          ) / 5
        : null;
    const indexes = await this.db.manager.find(IndexDailyEntity, {
      where: {
        tradeDate: Between(visible[visible.length - 1]?.calDate || date, date),
      },
      order: { tradeDate: 'ASC' },
    });
    const markets = ready.has(date)
      ? await this.db.manager.findBy(MarketDailyEntity, {
          tradeDate: date,
          scope: In(['hs', 'bj']),
        })
      : [];
    return {
      status,
      date,
      snapshot,
      previousAmount: previous?.amount ?? null,
      fiveDayAmount: mean,
      updatedAt: data.find((r) => r.tradeDate === date)?.updatedAt || null,
      series: visible
        .slice()
        .reverse()
        .map((r) => ({ date: r.calDate, data: byDate.get(r.calDate) || null })),
      indexes: MARKET_INDEXES.map((i) => ({
        ...i,
        series: indexes
          .filter(
            (r) =>
              r.tsCode === i.code &&
              selected.has(r.tradeDate) &&
              ready.has(r.tradeDate),
          )
          .map((r) => ({ date: r.tradeDate, ...r.data })),
      })),
      markets: markets.map((r) => ({ scope: r.scope, ...r.data })),
    };
  }

  async limits(q: MarketQueryDto) {
    if (!q.date) throw new BadRequestException('请选择交易日');
    normalizeDate(q.date);
    const run = await this.db.manager.findOneBy(SyncRunEntity, {
      task: 'market',
      tradeDate: q.date,
      status: 'success',
    });
    if (!run) return { ready: false, items: [] };
    const list = await this.db.manager.findBy(LimitEntity, {
      tradeDate: q.date,
      limit: q.type,
    });
    const items = list
      .filter(
        (r) =>
          inScope(r.tsCode, q.scope) &&
          (!q.height ||
            (q.height === 4 ? r.limitTimes >= 4 : r.limitTimes === q.height)) &&
          (!q.keyword ||
            `${r.name} ${r.tsCode}`
              .toLowerCase()
              .includes(q.keyword.toLowerCase())),
      )
      .sort(
        (a, b) =>
          b.limitTimes - a.limitTimes ||
          String(a.firstTime || '').localeCompare(String(b.firstTime || '')) ||
          a.tsCode.localeCompare(b.tsCode),
      );
    return { ready: true, items };
  }

  async ladder(q: MarketQueryDto) {
    const current = await this.limits({ ...q, type: 'U' });
    if (!current.ready) return { ...current, transitions: [] };
    const cal = await this.db.manager.findOneBy(TradeCalEntity, {
      calDate: q.date,
    });
    const old = await this.db.manager.findBy(LimitEntity, {
      tradeDate: cal!.preTradeDate,
      limit: 'U',
    });
    const mapping = new Map(
      (await this.db.manager.find(BseMappingEntity)).map((r) => [
        r.oldCode,
        r.newCode,
      ]),
    );
    const canonical = (code: string) => mapping.get(code) || code;
    const allCurrent = await this.db.manager.findBy(LimitEntity, {
      tradeDate: q.date,
      limit: 'U',
    });
    const limits = new Map(allCurrent.map((r) => [canonical(r.tsCode), r]));
    const trading = new Map(
      (await this.db.manager.findBy(DailyEntity, { tradeDate: q.date }))
        .filter((r) => Number(r.amount) > 0)
        .map((r) => [canonical(r.tsCode), r]),
    );
    return {
      ...current,
      transitions: old
        .filter((r) => r.limitTimes >= 2 && inScope(r.tsCode, q.scope))
        .map((r) => {
          const today = limits.get(canonical(r.tsCode));
          const daily = trading.get(canonical(r.tsCode));
          let state = today?.limitTimes === r.limitTimes + 1 ? '晋级' : '断板';
          if (!daily) state = '停牌／无成交';
          return {
            tsCode: canonical(r.tsCode),
            name: r.name,
            previousHeight: r.limitTimes,
            height: today?.limitTimes || 0,
            state,
            pctChg: daily ? Number(daily.pctChg) : null,
          };
        })
        .sort((a, b) => b.previousHeight - a.previousHeight),
    };
  }

  async dragon(date: string, code: string) {
    normalizeDate(date);
    return this.dragonCache.get(
      `${date}:${code}`,
      async () => {
        const params = { trade_date: date.replace(/-/g, ''), ts_code: code };
        const [summary, seats] = await Promise.all([
          this.tushare.queryData('top_list', params, undefined, 10000, 7000),
          this.tushare.queryData('top_inst', params, undefined, 10000, 7000),
        ]);
        return {
          summary: readSnapshot(summary, ['ts_code', 'trade_date'], true),
          seats: readSnapshot(seats, ['ts_code', 'trade_date'], true),
          queriedAt: new Date().toISOString(),
        };
      },
      (r) => !r.summary.length && !r.seats.length,
    );
  }
}
