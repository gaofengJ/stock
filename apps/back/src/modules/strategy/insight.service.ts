/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue -- Bounded daily work shares the existing sync queue. */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import * as dayjs from 'dayjs';
import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { TradeCalEntity } from '../source/trade-cal/trade-cal.entity';
import { DailyEntity } from '../source/daily/daily.entity';
import { SyncWriteService } from '../daily-task/sync-write.service';
import { SyncRunEntity } from '../daily-task/sync-run.entity';
import {
  latestSyncDate,
  normalizeDate,
  automaticSyncRetryBlocked,
  permanentSyncError,
  shanghaiDate,
} from '../daily-task/sync.utils';
import { readSnapshot } from '../daily-task/sync-source.service';
import { MarketSyncService } from '../analysis/market/market-sync.service';
import { MarketResearchService } from '../analysis/market/market-research.service';
import { SectorService } from '../analysis/market/sector.service';
import {
  BseMappingEntity,
  MarketBreadthEntity,
} from '../analysis/market/market.entity';
import { inScope, MarketScope } from '../analysis/market/market.constants';
import { TrendFactorEntity, TrendFactor } from './trend.entity';
import { StockInsightEntity, ThsHotEntity, HotStock } from './insight.entity';
import { StrategySnapshotReader } from './snapshot-reader';
import { TrendPoint, TREND_DEFAULTS } from './trend-rules';
import {
  HORIZONS,
  hotChanges,
  INSIGHT_VERSION,
  observationReturn,
  positive,
  rankInsights,
  stockInsight,
  summarizeReturns,
} from './insight.utils';

type RevisionRow = { date: string; task: string; value: string };
const hash = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

@Injectable()
export class InsightService {
  private snapshotReader: StrategySnapshotReader;

  // At most 64 daily compact factor snapshots; reuse adjacent backfill windows.
  private factors = new Map<
    string,
    { revision: string; data: TrendFactor[] }
  >();

  constructor(
    private db: DataSource,
    private writes: SyncWriteService,
    private sync: MarketSyncService,
    private research: MarketResearchService,
    private sectors: SectorService,
    private source: TushareService,
  ) {
    this.snapshotReader = new StrategySnapshotReader(db);
  }

  private async calendar(
    date: string,
    count: number,
    manager = this.db.manager,
  ) {
    normalizeDate(date);
    return (
      await manager.find(TradeCalEntity, {
        where: { isOpen: 1, calDate: LessThanOrEqual(date) },
        order: { calDate: 'DESC' },
        take: count,
      })
    ).map((r) => r.calDate);
  }

  private async revisions(
    start: string,
    end: string,
    manager = this.db.manager,
  ) {
    const from = dayjs(start).subtract(10, 'month').format('YYYY-MM-DD');
    const [runs, factors, policies]: RevisionRow[][] = await Promise.all([
      manager.query(
        "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,task,CONCAT(status,':',updated_at) value FROM t_sync_run WHERE task IN ('daily','strategy-factor') AND trade_date BETWEEN ? AND ? ORDER BY trade_date,task",
        [from, end],
      ),
      manager.query(
        "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,'factor' task,CAST(updated_at AS CHAR) value FROM t_source_strategy_factor WHERE trade_date BETWEEN ? AND ? ORDER BY trade_date",
        [from, end],
      ),
      manager.query(
        "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date,'policy' task,reason value FROM t_sync_day_policy WHERE trade_date BETWEEN ? AND ? ORDER BY trade_date",
        [from, end],
      ),
    ]);
    return [...runs, ...factors, ...policies];
  }

  private revision(date: string, rows: RevisionRow[]) {
    const from = dayjs(date).subtract(10, 'month').format('YYYY-MM-DD');
    return hash([
      INSIGHT_VERSION,
      rows.filter((r) => r.date >= from && r.date <= date),
    ]);
  }

  private async snapshots(dates: string[], detailDates?: string[]) {
    if (!dates.length) return new Map<string, StockInsightEntity>();
    const [rows, revisions] = await Promise.all([
      this.db.manager.find(StockInsightEntity, {
        where: { tradeDate: In(dates) },
        select: [
          'id',
          'updatedAt',
          'tradeDate',
          'revision',
          'summary',
          'signals',
        ],
      }),
      this.revisions([...dates].sort()[0], [...dates].sort().at(-1)!),
    ]);
    const valid = new Map(
      rows
        .filter((r) => r.revision === this.revision(r.tradeDate, revisions))
        .map((r) => [r.tradeDate, r]),
    );
    const selected = [...valid.values()].filter(
      (row) => !detailDates || detailDates.includes(row.tradeDate),
    );
    if (selected.length) {
      const details = await this.snapshotReader.read(
        't_processed_stock_insight',
        selected,
        (value) => value as StockInsightEntity['data'],
      );
      selected.forEach((row) => {
        const data = details.get(row.id);
        if (data) valid.set(row.tradeDate, Object.assign(row, { data }));
        else valid.delete(row.tradeDate);
      });
    }
    return valid;
  }

  /** Load only signal stocks and their observation endpoints, not every stock's history. */
  private async observations(dates: string[], strategy: string) {
    type Metadata = Pick<
      StockInsightEntity,
      'id' | 'updatedAt' | 'tradeDate' | 'revision' | 'signals'
    >;
    const [rows, versions] = await Promise.all([
      this.db.query<Metadata[]>(
        "SELECT id,updated_at updatedAt,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,revision,signals FROM t_processed_stock_insight WHERE trade_date IN (?)",
        [dates],
      ),
      this.revisions(dates[0], dates.at(-1)!),
    ]);
    const valid = rows.filter(
      (r) => r.revision === this.revision(r.tradeDate, versions),
    );
    const wanted = new Map(dates.map((d) => [d, new Set<string>()]));
    valid.forEach((r) => {
      if (!r.signals.ready.includes(strategy)) return;
      const i = dates.indexOf(r.tradeDate);
      r.signals.items
        .filter((hit) => hit.keys.includes(strategy))
        .forEach((hit) => {
          [0, ...HORIZONS].forEach(
            (h) => wanted.get(dates[i + h])?.add(hit.code),
          );
        });
    });
    const result = new Map<
      string,
      Pick<StockInsightEntity, 'tradeDate' | 'signals' | 'data'>
    >();
    const selected = valid.filter((row) => wanted.get(row.tradeDate)?.size);
    const indexes = await this.snapshotReader.read(
      't_processed_stock_insight',
      selected,
      (codes) => codes as string[],
      ['$[*].code'],
    );
    for (const row of valid) {
      if (!wanted.get(row.tradeDate)?.size) {
        result.set(row.tradeDate, { ...row, data: [] });
        continue;
      }
      const codes = indexes.get(row.id);
      if (!codes) continue;
      const paths = codes.flatMap((code, i) =>
        wanted.get(row.tradeDate)?.has(code) ? [`$[${i}]`] : [],
      );
      if (!paths.length) {
        result.set(row.tradeDate, { ...row, data: [] });
        continue;
      }
      const data = await this.snapshotReader.read(
        't_processed_stock_insight',
        [row],
        (value) =>
          (paths.length === 1 ? [value] : value) as StockInsightEntity['data'],
        paths,
      );
      if (data.has(row.id))
        result.set(row.tradeDate, { ...row, data: data.get(row.id)! });
    }
    return result;
  }

  async buildDay(
    manager: EntityManager,
    date: string,
    revisions: RevisionRow[],
  ) {
    const revision = this.revision(date, revisions);
    const previous = await manager.findOneBy(StockInsightEntity, {
      tradeDate: date,
    });
    if (previous?.revision === revision) return;
    if (await this.writes.excluded(manager, date))
      throw new Error('该日受主动删除保护');
    await this.sync.stage(manager, 'stock-insight', date, async () => {
      const dates = (await this.calendar(date, 61, manager)).reverse();
      if (dates.length !== 61) throw new Error('等待61个交易日数据');
      const ready = new Set(
        revisions
          .filter(
            (r) =>
              r.task === 'strategy-factor' && r.value.startsWith('success:'),
          )
          .map((r) => r.date),
      );
      const policies = new Set(
        revisions.filter((r) => r.task === 'policy').map((r) => r.date),
      );
      if (dates.some((d) => !ready.has(d) || policies.has(d)))
        throw new Error('等待完整复权历史，缺失日期不能按零处理');
      const daily = await manager.find(DailyEntity, {
        where: { tradeDate: date },
        select: ['tsCode', 'name', 'amount', 'vol'],
      });
      const mapping = new Map(
        (await manager.find(BseMappingEntity)).map((r) => [
          r.oldCode,
          r.newCode,
        ]),
      );
      const canonical = (code: string) => mapping.get(code) || code;
      const universe = new Map<string, DailyEntity>();
      for (const r of daily) {
        const key = canonical(r.tsCode);
        if (universe.has(key)) throw new Error(`当日股票代码映射冲突: ${key}`);
        universe.set(key, r);
      }
      if (!universe.size) throw new Error('当日行情未就绪');
      const points = new Map<string, Map<string, TrendPoint>>();
      const versions = new Map(
        revisions
          .filter((r) => r.task === 'factor')
          .map((r) => [r.date, r.value]),
      );
      for (const day of dates) {
        let cached = this.factors.get(day);
        if (!cached || cached.revision !== versions.get(day)) {
          const snapshot = await manager.findOneBy(TrendFactorEntity, {
            tradeDate: day,
          });
          if (!snapshot) throw new Error('复权快照缺失');
          if (this.factors.size >= 64)
            this.factors.delete(this.factors.keys().next().value!);
          cached = { revision: versions.get(day) || '', data: snapshot.data };
          this.factors.set(day, cached);
        }
        for (const [
          code,
          open,
          close,
          high,
          low,
          basis,
          conversion,
        ] of cached.data) {
          const key = canonical(code);
          if (!universe.has(key) || ![open, close, high, low].every(positive))
            continue;
          if (!points.has(key)) points.set(key, new Map());
          if (points.get(key)!.has(day))
            throw new Error(`复权代码映射冲突: ${day} ${key}`);
          points.get(key)!.set(day, {
            date: day,
            open: open!,
            close: close!,
            high: high!,
            low: low!,
            basis: basis || key,
            conversion,
          });
        }
      }
      const rows = [...universe].map(([code, row]) =>
        stockInsight(
          code,
          row.name,
          dates,
          points.get(code) || new Map(),
          Number(row.vol) > 0 && Number(row.amount) > 0,
        ),
      );
      const summary = rankInsights(rows);
      const signals = await this.research.signals({
        date,
        scope: 'all',
        trajectoryDays: 1,
        days: 20,
        type: 'U',
      });
      const keys = Object.keys(signals.readyByStrategy);
      if (
        !keys.length ||
        keys.some((key) => !signals.readyByStrategy[key].includes(date))
      )
        throw new Error('策略窗口尚未完整，等待策略数据');
      await manager.save(StockInsightEntity, {
        ...previous,
        tradeDate: date,
        revision,
        data: rows,
        summary,
        signals: {
          version: INSIGHT_VERSION,
          parameters: TREND_DEFAULTS,
          ready: keys,
          items: signals.items.map((r) => ({
            code: r.tsCode,
            keys: [...new Set(r.strategies)],
          })),
        },
      });
    });
  }

  async enqueue(manager: EntityManager, end: string) {
    const [latest] = await manager.query(
      "SELECT DATE_FORMAT(MAX(trade_date),'%Y-%m-%d') date FROM t_source_daily WHERE trade_date<=?",
      [latestSyncDate()],
    );
    const dates = await this.calendar(latest?.date || end, 60, manager);
    if (!dates.length) return;
    const start = dates.at(-1)!;
    for (const mode of ['insights', 'hot']) {
      const [failure] = await manager.query(
        "SELECT error,updated_at updatedAt,DATE_FORMAT(end_date,'%Y-%m-%d') endDate FROM t_admin_job WHERE mode=? AND actor_id IS NULL AND status='failed' ORDER BY id DESC LIMIT 1",
        [mode],
      );
      if (automaticSyncRetryBlocked(failure, dates[0])) continue;
      await manager.query(
        "INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,?,?,?,'queued',?,?,'等待增量计算') ON DUPLICATE KEY UPDATE start_date=LEAST(start_date,VALUES(start_date)),end_date=GREATEST(end_date,VALUES(end_date))",
        [
          mode === 'hot' ? '同花顺日终人气' : '市场与策略观察统计',
          start,
          dates[0],
          `stock-${mode}-history`,
          mode,
        ],
      );
    }
  }

  @Cron('0 40 22 * * 1-5', { timeZone: 'Asia/Shanghai' })
  async enqueueEvening() {
    if (
      process.env.SCHEDULE_ENABLED === 'false' ||
      process.env.SYNC_SCHEDULE_ENABLED === 'false'
    )
      return;
    await this.writes.withLock(
      async (manager) => {
        const dates = await this.calendar(latestSyncDate(), 1, manager);
        if (dates[0]) await this.enqueue(manager, dates[0]);
      },
      true,
      true,
    );
  }

  async batch(start: string, end: string, hot = false) {
    normalizeDate(start);
    normalizeDate(end);
    return this.writes.withLock(
      async (manager) => {
        const days = (
          await this.calendar(
            end < latestSyncDate() ? end : latestSyncDate(),
            730,
            manager,
          )
        ).filter((d) => d >= start);
        const protectedRows: { date: string }[] = await manager.query(
          "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date FROM t_sync_day_policy WHERE trade_date BETWEEN ? AND ?",
          [start, end],
        );
        const protectedDates = protectedRows.map((r) => r.date);
        const revisions = await this.revisions(start, end, manager);
        const records = hot
          ? await manager.find(ThsHotEntity, { select: ['tradeDate'] })
          : await manager.find(StockInsightEntity, {
              select: ['tradeDate', 'revision'],
            });
        const pending = days.filter(
          (d) =>
            !protectedDates.includes(d) &&
            !records.some(
              (r) =>
                r.tradeDate === d &&
                (hot ||
                  (r as StockInsightEntity).revision ===
                    this.revision(d, revisions)),
            ),
        );
        // An absent historical day-end snapshot must not block older dates or
        // consume provider quota every five minutes. Keep the gap, retry daily.
        const recentGaps =
          hot && pending.length
            ? await manager.find(SyncRunEntity, {
                where: {
                  task: 'ths-hot',
                  tradeDate: In(pending),
                  status: 'failed',
                },
              })
            : [];
        const deferred = new Map(
          recentGaps
            .filter(
              (r) =>
                r.tradeDate < shanghaiDate() &&
                r.error === '数据源返回空快照' &&
                Date.now() - new Date(r.updatedAt).getTime() <
                  24 * 60 * 60 * 1000,
            )
            .map((r) => [
              r.tradeDate,
              new Date(new Date(r.updatedAt).getTime() + 24 * 60 * 60 * 1000),
            ]),
        );
        const actionable = pending.filter((d) => !deferred.has(d));
        const completed: string[] = [];
        const failures: string[] = [];
        for (const date of actionable.slice(0, 3)) {
          try {
            if (hot) await this.syncHot(manager, date);
            else await this.buildDay(manager, date, revisions);
            completed.push(date);
          } catch (e) {
            failures.push(`${date}: ${e.message}`);
            if (permanentSyncError(e)) break;
          }
        }
        const waiting =
          deferred.size > 0 &&
          pending.length - completed.length === deferred.size &&
          !failures.length;
        return {
          completed,
          failures,
          retryAt: waiting
            ? new Date(
                Math.min(...[...deferred.values()].map((d) => d.getTime())),
              )
            : undefined,
          waitingReason: waiting
            ? `日终人气数据待源端补齐，按源端冷却时间重试：${[
                ...deferred.keys(),
              ].join('、')}`
            : undefined,
          remaining: pending.length - completed.length,
          protectedDates,
          calendarReady: true,
        };
      },
      true,
      true,
    );
  }

  async syncHot(manager: EntityManager, date: string) {
    if (await this.writes.excluded(manager, date))
      throw new Error('该日受主动删除保护');
    const today = shanghaiDate();
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
    if (date > today || (date === today && localTime < '22:40'))
      throw new Error('等待22:40日终人气榜');
    await this.sync.stage(manager, 'ths-hot', date, async () => {
      const result = await this.source.queryData(
        'ths_hot',
        { trade_date: date.replace(/-/g, ''), market: '热股', is_new: 'Y' },
        'trade_date,ts_code,ts_name,rank,hot,rank_time',
        2000,
      );
      const source = readSnapshot(result, [
        'trade_date',
        'ts_code',
        'rank',
        'rank_time',
      ]);
      const mapping = new Map(
        (await manager.find(BseMappingEntity)).map((r) => [
          r.oldCode,
          r.newCode,
        ]),
      );
      const rows: HotStock[] = source
        .map((r) => {
          if (String(r.tradeDate).replace(/-/g, '') !== date.replace(/-/g, ''))
            throw new Error('人气榜日期不匹配');
          const rank = Number(r.rank);
          const time = String(r.rankTime || '');
          if (
            !Number.isInteger(rank) ||
            rank < 1 ||
            rank > 100 ||
            !time.startsWith(`${date} 22:3`) ||
            !/^\d{4}-\d{2}-\d{2} 22:3\d:\d{2}$/.test(time)
          )
            throw new Error('人气榜排行或日终时间无效');
          return {
            code: mapping.get(r.tsCode) || r.tsCode,
            name: String(r.tsName || ''),
            rank,
            hot:
              Number.isFinite(Number(r.hot)) && r.hot != null
                ? Number(r.hot)
                : null,
            time,
          };
        })
        .filter((r) => /^\d{6}\.(SH|SZ|BJ)$/.test(r.code) && r.rank <= 100)
        .sort((a, b) => a.rank - b.rank);
      if (
        !rows.length ||
        rows.length !== source.length ||
        new Set(rows.map((r) => r.code)).size !== rows.length ||
        new Set(rows.map((r) => r.rank)).size !== rows.length
      )
        throw new Error('日终人气榜为空或排名重复');
      const old = await manager.findOneBy(ThsHotEntity, { tradeDate: date });
      await manager.save(ThsHotEntity, {
        ...old,
        tradeDate: date,
        data: rows,
        rankTime: rows
          .map((r) => r.time)
          .sort()
          .at(-1)!,
      });
    });
  }

  async extremes(
    date: string,
    scope: MarketScope,
    period: number,
    days: number,
  ) {
    const dates = await this.calendar(date, days);
    const records = await this.snapshots(dates, [date]);
    const current = records.get(date);
    return {
      date,
      scope,
      ready: !!current,
      period,
      snapshot: current?.summary[scope]?.[period] || null,
      series: dates
        .slice()
        .reverse()
        .map((d) => ({
          date: d,
          data: records.get(d)?.summary[scope]?.[period] || null,
        })),
      items:
        current?.data
          .filter(
            (r) =>
              inScope(r.code, scope) &&
              (r.periods[period]?.high || r.periods[period]?.low),
          )
          .map((r) => ({
            code: r.code,
            name: r.name,
            high: r.periods[period]!.high,
            low: r.periods[period]!.low,
            change: r.periods[period]!.change,
          })) || [],
    };
  }

  async popularity(
    date: string,
    history = true,
    code: string | undefined = undefined,
  ) {
    const dates = await this.calendar(date, history ? 20 : 2);
    const policies: { date: string }[] = await this.db.query(
      "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') date FROM t_sync_day_policy WHERE trade_date IN (?)",
      [dates.length ? dates : [date]],
    );
    const rows = dates.length
      ? await this.db.manager.find(ThsHotEntity, {
          where: {
            tradeDate: In(
              dates.filter((d) => !policies.some((r) => r.date === d)),
            ),
          },
        })
      : [];
    const runs = dates.length
      ? await this.db.manager.find(SyncRunEntity, {
          where: { task: 'ths-hot', tradeDate: In(dates), status: 'success' },
        })
      : [];
    const byDate = new Map(
      rows
        .filter((r) => runs.some((s) => s.tradeDate === r.tradeDate))
        .map((r) => [r.tradeDate, r]),
    );
    const current = byDate.get(date);
    const previous = byDate.get(dates[1]);
    const stage = await this.db.manager.findOneBy(SyncRunEntity, {
      task: 'ths-hot',
      tradeDate: date,
    });
    const items = hotChanges(
      current?.data || [],
      previous?.data || null,
      previous?.data.length === 100,
    )
      .filter((r) => !code || r.code === code)
      .map((r) => {
        let streak = 0;
        for (const d of dates) {
          if (!byDate.get(d)?.data.some((s) => s.code === r.code)) break;
          streak += 1;
        }
        return {
          ...r,
          streak,
          streakCapped:
            streak === dates.length ||
            (!!dates[streak] && byDate.get(dates[streak])?.data.length !== 100),
          history: (history && code ? dates : [])
            .slice()
            .reverse()
            .map((d) => ({
              date: d,
              rank:
                byDate.get(d)?.data.find((s) => s.code === r.code)?.rank ??
                null,
              ready: byDate.get(d)?.data.length === 100,
            })),
        };
      });
    return {
      date,
      ready: !!current,
      complete: current?.data.length === 100,
      count: current?.data.length || 0,
      previousDate: dates[1] || null,
      previousReady: previous?.data.length === 100,
      rankTime: current?.rankTime || null,
      stage: stage ? { status: stage.status, error: stage.error } : null,
      items,
      exited:
        current?.data.length === 100 && previous
          ? previous.data.filter(
              (r) => !current.data.some((s) => s.code === r.code),
            )
          : [],
    };
  }

  async comparison(date: string, codes?: string[]) {
    const [records, popularity, members, dates] = await Promise.all([
      this.snapshots([date]),
      this.popularity(date, false),
      this.sectors.snapshots(date, undefined, false, 'I'),
      this.calendar(date, 61),
    ]);
    const record = records.get(date);
    const sectorByStock = new Map<string, typeof members>();
    for (const member of members) {
      for (const r of member.members)
        sectorByStock.set(r.code, [
          ...(sectorByStock.get(r.code) || []),
          member,
        ]);
    }
    const wanted = new Set(codes || record?.data.map((row) => row.code) || []);
    const industryCodes = members
      .filter((member) => member.members.some((row) => wanted.has(row.code)))
      .map((member) => member.tsCode);
    const priceDates = [dates[0], dates[20], dates[60]].filter(Boolean);
    const prices: {
      tsCode: string;
      tradeDate: string;
      close: number | null;
    }[] =
      industryCodes.length && priceDates.length
        ? await this.db.query(
            "SELECT ts_code tsCode,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,JSON_EXTRACT(data,'$.close') close FROM t_source_ths_daily WHERE ts_code IN (?) AND trade_date IN (?)",
            [industryCodes, priceDates],
          )
        : [];
    const closes = new Map(
      prices.map((row) => [`${row.tsCode}:${row.tradeDate}`, row.close]),
    );
    const hits = new Map(
      record?.signals.items.map((r) => [r.code, r.keys]) || [],
    );
    return {
      date,
      ready: !!record,
      ruleVersion: record?.signals.version || INSIGHT_VERSION,
      items:
        record?.data
          .filter((r) => !codes || codes.includes(r.code))
          .map((r) => {
            const industries = sectorByStock.get(r.code) || [];
            const member = industries.length === 1 ? industries[0] : null;
            return {
              code: r.code,
              name: r.name,
              periods: r.periods,
              strategies: hits.get(r.code) || [],
              industryCode: member?.tsCode || null,
              industryAsOf: member?.asOf || null,
              relative: Object.fromEntries(
                [20, 60].map((p) => {
                  const start =
                    member && closes.get(`${member.tsCode}:${dates[p]}`);
                  const end = member && closes.get(`${member.tsCode}:${date}`);
                  return [
                    p,
                    positive(start) && positive(end) && r.periods[p]
                      ? r.periods[p]!.change - (end / start - 1) * 100
                      : null,
                  ];
                }),
              ),
            };
          }) || [],
      popularity,
    };
  }

  /** A published standard signal is only a prefilter; trend evidence is still evaluated. */
  async standardCandidates(date: string, strategy: string, options: object) {
    // Standard >5% hits remain a superset for stricter filters. Lower thresholds
    // must evaluate all stocks rather than drop hits outside the standard list.
    if (
      strategy === 'volumeBreakout' &&
      ((options as any).minTurnoverRateF ?? 5) < 5
    )
      return undefined;
    if (
      !Object.entries(TREND_DEFAULTS).every(
        ([key, value]) => (options as any)[key] === value,
      )
    )
      return undefined;
    const row = await this.db.manager.findOne(StockInsightEntity, {
      where: { tradeDate: date },
      select: ['updatedAt', 'revision', 'signals'],
    });
    if (
      !row ||
      row.signals.version !== INSIGHT_VERSION ||
      !row.signals.ready.includes(strategy) ||
      !Object.entries(TREND_DEFAULTS).every(
        ([key, value]) => (row.signals.parameters as any)[key] === value,
      )
    )
      return undefined;
    const versions = await this.revisions(date, date);
    if (row.revision !== this.revision(date, versions)) return undefined;
    // Identity and alias repairs also invalidate the prefilter, even though the
    // legacy insight revision did not include their versions.
    const changed = await this.db.query(
      'SELECT id FROM t_source_stock_history WHERE updated_at>? UNION ALL SELECT id FROM t_source_bse_mapping WHERE updated_at>? LIMIT 1',
      [row.updatedAt, row.updatedAt],
    );
    if (changed.length) return undefined;
    return row.signals.items
      .filter((hit) => hit.keys.includes(strategy))
      .map((hit) => hit.code);
  }

  async performance(
    date: string,
    strategy: string,
    days: number,
    sector?: string,
  ) {
    const dates = [...(await this.calendar(date, days + 10))].reverse();
    if (!dates.length || dates.at(-1) !== date)
      throw new BadRequestException('请选择交易日');
    const visible = dates.slice(-days);
    const records = await this.observations(visible, strategy);
    const stocksByDate = new Map(
      [...records].map(([d, row]) => [
        d,
        new Map(row.data.map((r) => [r.code, r])),
      ]),
    );
    const samples: any[] = [];
    const missingDates: string[] = [];
    const memberships = new Map<string, Set<string>>();
    const sectorAsOf = new Map<string, string | null>();
    const breadth = await this.db.manager.find(MarketBreadthEntity, {
      where: { tradeDate: In(visible), scope: 'all' },
    });
    for (const d of visible) {
      const record = records.get(d);
      if (!record || !record.signals.ready.includes(strategy)) {
        missingDates.push(d);
        continue;
      }
      if (sector) {
        const [snapshot] = await this.sectors.snapshots(d, sector);
        if (!snapshot || snapshot.asOf > d) {
          missingDates.push(d);
          sectorAsOf.set(d, snapshot?.asOf || null);
          continue;
        }
        memberships.set(d, new Set(snapshot?.members.map((r) => r.code) || []));
        sectorAsOf.set(d, snapshot?.asOf || null);
      }
      const group = breadth.find((r) => r.tradeDate === d)?.data.ma20.ratio;
      for (const hit of record.signals.items.filter(
        (r) =>
          r.keys.includes(strategy) &&
          (!sector || memberships.get(d)!.has(r.code)),
      )) {
        const start = stocksByDate.get(d)?.get(hit.code);
        const index = dates.indexOf(d);
        const outcomes = Object.fromEntries(
          HORIZONS.map((h) => {
            const endDate = dates[index + h];
            if (!endDate)
              return [h, { date: null, value: null, state: '未到期' }];
            const end = stocksByDate.get(endDate)?.get(hit.code);
            const value = observationReturn(start, end);
            // A validated daily snapshot with no trade is different from a
            // missing/stale snapshot or an unavailable adjustment basis.
            const inactive = records.has(endDate) && (!end || !end.traded);
            const unavailableState = inactive ? '观察日无成交' : '数据不足';
            return [
              h,
              {
                date: endDate,
                value,
                state: value != null ? '有效' : unavailableState,
              },
            ];
          }),
        );
        const environment =
          (group ?? 0) >= 50 ? '多数站上MA20' : '少数站上MA20';
        samples.push({
          date: d,
          code: hit.code,
          name: start?.name || hit.code,
          environment: group == null ? '未知' : environment,
          outcomes,
        });
      }
    }
    const summarize = (rows: typeof samples) =>
      HORIZONS.map((h) => ({
        horizon: h,
        ...summarizeReturns(
          rows.map((r) => r.outcomes[h].value).filter((v) => v != null),
        ),
        total: rows.length,
        pending: rows.filter((r) => r.outcomes[h].state === '未到期').length,
        inactive: rows.filter((r) => r.outcomes[h].state === '观察日无成交')
          .length,
        missing: rows.filter((r) => r.outcomes[h].state === '数据不足').length,
      }));
    return {
      date,
      strategy,
      days,
      version: INSIGHT_VERSION,
      parameters: TREND_DEFAULTS,
      readyDays: visible.length - missingDates.length,
      expectedDays: visible.length,
      missingDates,
      summary: summarize(samples),
      groups: ['多数站上MA20', '少数站上MA20', '未知'].map((name) => ({
        name,
        summary: summarize(samples.filter((r) => r.environment === name)),
      })),
      sectorSnapshots: [...sectorAsOf].map(([d, asOf]) => ({ date: d, asOf })),
      items: samples.reverse(),
    };
  }
}
