/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue -- Limit source requests and process one snapshot at a time. */
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager, In, LessThanOrEqual } from 'typeorm';
import * as dayjs from 'dayjs';
import { TushareService } from '@/shared/tushare/tushare.service';
import {
  StockIdentityService,
  readIdentityRows,
} from '@/modules/source/stock/stock-identity.service';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { SyncDayPolicyEntity } from '@/modules/daily-task/sync-day-policy.entity';
import {
  normalizeDate,
  latestSyncDate,
  permanentSyncError,
  shanghaiDate,
} from '@/modules/daily-task/sync.utils';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import {
  hasValidStrategySequence,
  meetsCommonStrategyConditions,
} from '@/modules/source/daily/strategy-validation';
import { TrendFactor, TrendFactorEntity } from './trend.entity';
import { StockHistoryEntity } from '../source/stock/stock-history.entity';
import { StrategySnapshotReader, SnapshotVersion } from './snapshot-reader';
import {
  evaluateTrend,
  requiredTrendDays,
  TREND_KEYS,
  TrendKey,
  TrendOptions,
  TrendPoint,
  TREND_DEFAULTS,
  normalizeTrendSeries,
} from './trend-rules';

@Injectable()
export class TrendService {
  private snapshotReader: StrategySnapshotReader;

  constructor(
    private db: DataSource,
    private source: TushareService,
    private identity: StockIdentityService,
    private writes: SyncWriteService,
  ) {
    this.snapshotReader = new StrategySnapshotReader(db);
  }

  private identityManager() {
    return new Proxy(this.db.manager, {
      get: (target, property) => {
        if (property === 'findOneBy')
          return async (entity: unknown, where: any) => {
            if (
              entity !== StockHistoryEntity ||
              where.snapshotKey !== 'identity'
            )
              return target.findOneBy(entity as any, where);
            const row = await target.findOne(StockHistoryEntity, {
              where,
              select: ['id', 'updatedAt', 'asOf', 'snapshotKey'],
            });
            if (!row) return null;
            const values = await this.snapshotReader.read(
              't_source_stock_history',
              [row],
              (value) => value as StockHistoryEntity['data'],
            );
            return values.has(row.id)
              ? Object.assign(row, { data: values.get(row.id)! })
              : null;
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as EntityManager;
  }

  private async factorData(rows: SnapshotVersion[], codes: Set<string>) {
    if (codes.size > 200)
      return this.snapshotReader.read(
        't_source_strategy_factor',
        rows,
        (data: TrendFactor[]) => data.filter((row) => codes.has(row[0])),
      );
    const indexes = await this.snapshotReader.read(
      't_source_strategy_factor',
      rows,
      (value) => value as string[],
      ['$[*][0]'],
    );
    const result = new Map<number, TrendFactor[]>();
    for (let i = 0; i < rows.length; i += 4) {
      await Promise.all(
        rows.slice(i, i + 4).map(async (row) => {
          const index = indexes.get(row.id);
          if (!index) return;
          const paths = index.flatMap((code, n) =>
            codes.has(code) ? [`$[${n}]`] : [],
          );
          if (!paths.length) {
            result.set(row.id, []);
            return;
          }
          const data = await this.snapshotReader.read(
            't_source_strategy_factor',
            [row],
            (value) => (paths.length === 1 ? [value] : value) as TrendFactor[],
            paths,
          );
          if (data.has(row.id)) result.set(row.id, data.get(row.id)!);
        }),
      );
    }
    return result;
  }

  async chart(
    dto: TrendOptions & { date: string; code: string; strategyType: string },
    window = 260,
    includeEvidence = true,
  ) {
    const dates = await this.calendar(dto.date, window);
    const mapping = await this.db.manager.find(BseMappingEntity);
    const code =
      mapping.find((r) => r.oldCode === dto.code)?.newCode || dto.code;
    const codes = [
      code,
      ...mapping.filter((r) => r.newCode === code).map((r) => r.oldCode),
    ];
    const adjusted = TREND_KEYS.includes(dto.strategyType as TrendKey);
    const rows: any[] = await this.db.query(
      `SELECT DATE_FORMAT(d.trade_date,'%Y-%m-%d') date,d.ts_code code,d.open,d.close,d.high,d.low,d.vol,d.pre_close preClose,d.pct_chg pctChg,d.amount,d.turnover_rate_f turnoverRateF
       FROM t_source_daily d JOIN t_sync_run r ON r.trade_date=d.trade_date AND r.task='daily' AND r.status='success'
       LEFT JOIN t_sync_day_policy p ON p.trade_date=d.trade_date
       WHERE d.ts_code IN (?) AND d.trade_date IN (?) AND p.trade_date IS NULL ORDER BY d.trade_date`,
      [codes, dates],
    );
    const raw = new Map<string, any>();
    rows.forEach((row) => {
      const previous = raw.get(row.date);
      if (
        previous &&
        ['open', 'close', 'high', 'low', 'vol'].some(
          (key) => Number(previous[key]) !== Number(row[key]),
        )
      )
        throw new ConflictException('股票新旧代码日线冲突');
      raw.set(row.date, row);
    });
    let points: (TrendPoint | undefined)[];
    if (adjusted) {
      // Bound snapshot memory and avoid MySQL 5.7 repeatedly scanning each JSON
      // array with JSON_SEARCH when opening an individual stock.
      const published: (SnapshotVersion & { date: string })[] =
        await this.db.query(
          "SELECT f.id,f.updated_at updatedAt,MD5(f.data) contentHash,DATE_FORMAT(f.trade_date,'%Y-%m-%d') date FROM t_source_strategy_factor f JOIN t_sync_run r ON r.trade_date=f.trade_date AND r.task='strategy-factor' AND r.status='success' LEFT JOIN t_sync_day_policy p ON p.trade_date=f.trade_date WHERE f.trade_date IN (?) AND p.trade_date IS NULL",
          [dates],
        );
      const byDate = new Map<string, TrendPoint>();
      const tuples = await this.factorData(published, new Set([code]));
      for (const snapshot of published) {
        const tuple = tuples.get(snapshot.id)?.[0];
        if (!tuple || tuple.slice(1, 5).some((value) => value == null))
          continue;
        const [, open, close, high, low, basis, conversion] = tuple;
        byDate.set(snapshot.date, {
          date: snapshot.date,
          open: open!,
          close: close!,
          high: high!,
          low: low!,
          basis,
          conversion,
        });
      }
      points = dates.map((date) => byDate.get(date));
      const normalized = normalizeTrendSeries(points, code, points.length);
      if (!normalized)
        throw new ConflictException('复权价格基准不一致，暂不能展示K线');
      points = normalized;
    } else points = dates.map((date) => raw.get(date));
    const series = dates.map((date, i) => {
      const point = points[i];
      const volume = raw.get(date)?.vol;
      const valid =
        point &&
        (['open', 'close', 'high', 'low'] as const).every(
          (key) =>
            Number.isFinite(Number(point[key])) && Number(point[key]) > 0,
        ) &&
        Number(volume) > 0;
      return {
        date,
        open: valid ? Number(point.open) : null,
        close: valid ? Number(point.close) : null,
        high: valid ? Number(point.high) : null,
        low: valid ? Number(point.low) : null,
        vol: valid ? Number(volume) : null,
        quote: raw.has(date)
          ? Object.fromEntries(
              [
                'open',
                'close',
                'high',
                'low',
                'preClose',
                'pctChg',
                'vol',
                'amount',
                'turnoverRateF',
              ].map((key) => [
                key,
                raw.get(date)[key] == null ? null : Number(raw.get(date)[key]),
              ]),
            )
          : null,
      };
    });
    const hit =
      adjusted && includeEvidence
        ? await this.history(
            [dto.date],
            [dto.strategyType as TrendKey],
            dto,
            [code],
            true,
          )
        : null;
    return {
      code,
      date: dto.date,
      basis: adjusted ? '后复权' : '不复权',
      series,
      evidence:
        hit?.items[0]?.rows.find((row) => row.tsCode === code)?.trendEvidence ||
        null,
    };
  }

  async syncDay(manager: EntityManager, date: string, refresh = false) {
    normalizeDate(date);
    if (await this.writes.excluded(manager, date))
      throw new Error('该日受主动删除保护');
    const previousRun = await manager.findOneBy(SyncRunEntity, {
      task: 'strategy-factor',
      tradeDate: date,
    });
    if (
      !refresh &&
      previousRun?.status === 'success' &&
      (await manager.findOneBy(TrendFactorEntity, { tradeDate: date }))
    )
      return;
    const oldRun = await manager.findOne(SyncRunEntity, {
      where: { task: 'strategy-factor' },
      order: { updatedAt: 'DESC' },
    });
    const wait = (oldRun?.updatedAt.getTime() || 0) + 2200 - Date.now();
    if (wait > 0)
      await new Promise((resolve) => {
        setTimeout(resolve, wait);
      });
    const run = await manager.save(SyncRunEntity, {
      ...previousRun,
      task: 'strategy-factor',
      tradeDate: date,
      status: 'running',
      updatedAt: new Date(),
      error: null,
    });
    try {
      const fields = [
        'ts_code',
        'trade_date',
        'open_hfq',
        'close_hfq',
        'high_hfq',
        'low_hfq',
      ];
      const response = await this.source.queryData(
        'stk_factor_pro',
        { trade_date: date.replace(/-/g, '') },
        fields.join(','),
        10000,
      );
      const rows = readIdentityRows(response, fields);
      const mapping = new Map(
        (await manager.find(BseMappingEntity)).map((r) => [
          r.oldCode,
          r.newCode,
        ]),
      );
      const data = new Map<string, TrendFactor>();
      for (const row of rows) {
        if (
          row.trade_date !== date.replace(/-/g, '') ||
          !/^\d{6}\.(SH|SZ|BJ)$/.test(row.ts_code)
        )
          throw new Error('复权行情日期或代码异常');
        const code = mapping.get(row.ts_code) || row.ts_code;
        const prices = [row.open_hfq, row.close_hfq, row.high_hfq, row.low_hfq];
        // Source placeholders for non-trading/newly listed stocks are not zero prices.
        if (prices.some((value) => value == null)) {
          if (
            data.has(code) &&
            JSON.stringify(data.get(code)) !==
              JSON.stringify([code, null, null, null, null])
          )
            throw new Error('北交所新旧代码复权行情冲突');
          data.set(code, [code, null, null, null, null]);
          continue;
        }
        if (
          prices.some(
            (value) => !Number.isFinite(Number(value)) || Number(value) <= 0,
          )
        )
          throw new Error('复权行情价格无效');
        const tuple: TrendFactor = [
          code,
          Number(prices[0]),
          Number(prices[1]),
          Number(prices[2]),
          Number(prices[3]),
        ];
        if (code.endsWith('.BJ')) tuple[5] = row.ts_code;
        if (
          tuple[3]! + 1e-8 < Math.max(tuple[1]!, tuple[2]!) ||
          tuple[4]! - 1e-8 > Math.min(tuple[1]!, tuple[2]!)
        )
          throw new Error('复权行情四价异常');
        const previousTuple = data.get(code);
        if (previousTuple) {
          const different = [1, 2, 3, 4].some(
            (i) => previousTuple[i] !== tuple[i],
          );
          if (different) {
            if (
              !previousTuple[1] ||
              previousTuple[5] === row.ts_code ||
              !tuple[5]
            )
              throw new Error('北交所新旧代码复权行情冲突');
            const newer = row.ts_code === code ? tuple : previousTuple;
            const older = row.ts_code === code ? previousTuple : tuple;
            const ratio = Number(newer[2]) / Number(older[2]);
            if (
              [1, 2, 3, 4].some(
                (i) =>
                  Math.abs(Number(newer[i]) / Number(older[i]) / ratio - 1) >
                  1e-5,
              )
            )
              throw new Error('北交所新旧代码复权行情冲突');
            newer[6] = ratio;
            data.set(code, newer);
            continue;
          }
          if (previousTuple[5] === code) continue;
        }
        data.set(code, tuple);
      }
      const previous = await manager.findOneBy(TrendFactorEntity, {
        tradeDate: date,
      });
      if (
        !data.size ||
        data.size < rows.length * 0.95 ||
        [...data.values()].filter((tuple) => tuple[1] !== null).length <
          data.size * 0.95 ||
        (previous && data.size < previous.data.length * 0.8)
      )
        throw new Error('复权行情快照数量异常，保留原数据');
      await manager.transaction(async (tx) => {
        await tx.save(TrendFactorEntity, {
          ...previous,
          tradeDate: date,
          data: [...data.values()],
          updatedAt: new Date(),
        });
        await tx.update(SyncRunEntity, run.id, {
          status: 'success',
          error: null,
          updatedAt: new Date(),
        });
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

  async enqueue(manager: EntityManager, end: string) {
    // Two years of selectable dates plus the lookback before the first date.
    const start = dayjs(end)
      .subtract(2, 'year')
      .subtract(8, 'month')
      .format('YYYY-MM-DD');
    const [hole] = await manager.query(
      `SELECT c.cal_date FROM t_source_trade_cal c LEFT JOIN t_source_strategy_factor f ON f.trade_date=c.cal_date LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date LEFT JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='strategy-factor' WHERE c.is_open=1 AND c.cal_date BETWEEN ? AND ? AND (f.id IS NULL OR r.status IS NULL OR r.status<>'success') AND p.trade_date IS NULL LIMIT 1`,
      [start, end],
    );
    if (!hole) return;
    const [failed] = await manager.query(
      "SELECT error,updated_at updatedAt FROM t_admin_job WHERE mode='technical' AND actor_id IS NULL AND status='failed' ORDER BY id DESC LIMIT 1",
    );
    if (
      failed &&
      permanentSyncError(failed.error || '') &&
      shanghaiDate(failed.updatedAt) === shanghaiDate()
    )
      return;
    await manager.query(
      "INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,'策略复权行情补齐',?,?,'queued','strategy-factor-history','technical','等待补齐策略复权行情') ON DUPLICATE KEY UPDATE end_date=GREATEST(end_date,VALUES(end_date))",
      [start, end],
    );
  }

  async batch(start: string, end: string) {
    normalizeDate(start);
    normalizeDate(end);
    if (start > end) throw new BadRequestException('起止日期顺序错误');
    return this.writes.withLock(
      async (manager) => {
        const rows: { date: string }[] = await manager.query(
          `SELECT DATE_FORMAT(c.cal_date,'%Y-%m-%d') date FROM t_source_trade_cal c LEFT JOIN t_source_strategy_factor f ON f.trade_date=c.cal_date LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date LEFT JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='strategy-factor' WHERE c.is_open=1 AND c.cal_date BETWEEN ? AND ? AND (f.id IS NULL OR r.status IS NULL OR r.status<>'success') AND p.trade_date IS NULL ORDER BY c.cal_date DESC`,
          [start, end < latestSyncDate() ? end : latestSyncDate()],
        );
        const completed: string[] = [];
        const failures: string[] = [];
        for (const row of rows.slice(0, 3)) {
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

  private async calendar(date: string, take: number) {
    normalizeDate(date);
    const rows = await this.db.manager.find(TradeCalEntity, {
      where: { isOpen: 1, calDate: LessThanOrEqual(date) },
      order: { calDate: 'DESC' },
      take,
    });
    if (rows[0]?.calDate !== date)
      throw new BadRequestException('请选择交易日');
    return rows.map((r) => r.calDate).reverse();
  }

  async history(
    visible: string[],
    keys: readonly TrendKey[] = TREND_KEYS,
    options: TrendOptions = {},
    codes: string[] | undefined = undefined,
    strict = false,
  ) {
    if (!visible.length)
      return {
        items: [] as {
          date: string;
          rows: (DailyEntity & { trendEvidence: any })[];
          key: TrendKey;
        }[],
        readyByStrategy: {} as Record<string, string[]>,
      };
    const need = Math.max(
      ...keys.map((key) => requiredTrendDays(key, options)),
    );
    const dates = await this.calendar(
      visible[visible.length - 1],
      need + visible.length - 1 + (keys.includes('fiveMaUp') ? 9 : 0),
    );
    const identityManager = this.identityManager();
    const baseIdentity = await this.identity.load(
      [],
      undefined,
      identityManager,
    );
    const expanded = codes ? baseIdentity.expand(codes) : undefined;
    // Necessary signal-day conditions reduce the all-market read; raw SQL avoids
    // hydrating thousands of unused entity objects on each parameter change.
    const fields = this.db.manager
      .getRepository(DailyEntity)
      .metadata.columns.map((column) =>
        column.propertyName === 'tradeDate'
          ? "DATE_FORMAT(d.trade_date,'%Y-%m-%d') tradeDate"
          : `d.\`${column.databaseName}\` AS \`${column.propertyName}\``,
      )
      .join(',');
    const visibleRows: DailyEntity[] =
      expanded?.length === 0
        ? []
        : await this.db.query(
            `SELECT ${fields} FROM t_source_daily d WHERE d.trade_date IN (?) AND d.amount>50000 AND d.close*2>=d.high+d.low AND d.vol>0${
              expanded ? ' AND d.ts_code IN (?)' : ''
            }`,
            expanded ? [visible, expanded] : [visible],
          );
    // Supplement historical names only for actual candidates. Unrelated,
    // inactive registry entries must not trigger repeated upstream lookups.
    const identity = await this.identity.load(
      keys.includes('breakoutPullback')
        ? dates.slice(-((options.pullbackDays || 10) + visible.length))
        : visible,
      [
        ...new Set(
          visibleRows.map((row) => baseIdentity.canonical(row.tsCode)),
        ),
      ],
      identityManager,
    );
    const eligibleCodes = identity.expand([
      ...new Set(
        visibleRows
          .filter((row) => {
            const historical = Object.assign(new DailyEntity(), row, {
              name: identity.name(row.tsCode, row.tradeDate),
            });
            return (
              hasValidStrategySequence([historical]) &&
              meetsCommonStrategyConditions([historical])
            );
          })
          .map((row) => identity.canonical(row.tsCode)),
      ),
    ]);
    const volumeDates = dates
      // Historical visible days still supply baseline volumes even when their
      // close or turnover fails the signal-day candidate conditions.
      .slice(
        -(
          (keys.includes('breakoutPullback') ? options.pullbackDays || 10 : 0) +
          (options.volumeDays || 5) +
          visible.length
        ),
      );
    const [snapshots, policies, runs, raw] = await Promise.all([
      // ORM updates can reuse a second-resolution timestamp. Fingerprint the
      // payload as well so corrections never reuse an earlier factor index.
      this.db.query<(SnapshotVersion & { tradeDate: string })[]>(
        "SELECT id,updated_at updatedAt,MD5(data) contentHash,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate FROM t_source_strategy_factor WHERE trade_date IN (?)",
        [dates],
      ),
      this.db.manager.find(SyncDayPolicyEntity, {
        where: { tradeDate: In(dates) },
      }),
      this.db.manager.find(SyncRunEntity, {
        where: {
          tradeDate: In(dates),
          task: 'strategy-factor',
          status: 'success',
        },
      }),
      !eligibleCodes.length || !volumeDates.length
        ? Promise.resolve([] as DailyEntity[])
        : (this.db.query(
            "SELECT ts_code tsCode,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,open,close,high,low,pre_close preClose,vol,amount,up_limit upLimit FROM t_source_daily WHERE trade_date IN (?) AND ts_code IN (?)",
            [volumeDates, eligibleCodes],
          ) as Promise<DailyEntity[]>),
    ]);
    const protectedDates = new Set(policies.map((r) => r.tradeDate));
    const published = new Set(runs.map((r) => r.tradeDate));
    const snapshotDates = new Set(
      snapshots
        .filter(
          (r) => published.has(r.tradeDate) && !protectedDates.has(r.tradeDate),
        )
        .map((r) => r.tradeDate),
    );
    const rawMap = new Map<string, Map<string, DailyEntity>>();
    for (const row of [...raw, ...visibleRows]) {
      const code = identity.canonical(row.tsCode);
      if (!rawMap.has(code)) rawMap.set(code, new Map());
      const previous = rawMap.get(code)!.get(row.tradeDate);
      if (
        previous &&
        (['open', 'close', 'high', 'low', 'vol'] as const).some(
          (k) => Number(previous[k]) !== Number(row[k]),
        )
      )
        throw new ConflictException('股票新旧代码日线冲突');
      if (!previous || row.tsCode === code)
        rawMap.get(code)!.set(
          row.tradeDate,
          Object.assign(new DailyEntity(), row, {
            tsCode: code,
            name: identity.name(code, row.tradeDate),
          }),
        );
    }
    if (
      [...rawMap].some(([code, rows]) =>
        visible.some((date) => {
          const row = rows.get(date);
          return (
            row &&
            identity.listed(code, date) &&
            !row.name &&
            Number(row.vol) > 0
          );
        }),
      )
    )
      throw new ConflictException('策略所需历史股票名称缺失，请补同步后重试');
    const candidateCodes = new Set(
      [...rawMap]
        .filter(([, rows]) =>
          visible.some((d) => {
            const row = rows.get(d);
            return (
              row &&
              hasValidStrategySequence([row]) &&
              meetsCommonStrategyConditions([row])
            );
          }),
        )
        .map(([code]) => code),
    );
    const points = new Map<string, Map<string, TrendPoint>>();
    const unavailable = new Map<string, Set<string>>();
    const factorRows = candidateCodes.size
      ? snapshots.filter((row) => snapshotDates.has(row.tradeDate))
      : [];
    const factors = await this.factorData(factorRows, candidateCodes);
    for (const snapshot of factorRows)
      for (const [
        code,
        open,
        close,
        high,
        low,
        basis,
        conversion,
      ] of factors.get(snapshot.id) || []) {
        if (!candidateCodes.has(code)) continue;
        if (open == null || close == null || high == null || low == null) {
          if (!unavailable.has(code)) unavailable.set(code, new Set());
          unavailable.get(code)!.add(snapshot.tradeDate);
          continue;
        }
        if (!points.has(code)) points.set(code, new Map());
        const row = rawMap.get(code)?.get(snapshot.tradeDate);
        const volume = row?.vol;
        points.get(code)!.set(snapshot.tradeDate, {
          date: snapshot.tradeDate,
          open,
          close,
          high,
          low,
          basis,
          conversion,
          vol: volume == null ? undefined : Number(volume),
          eligible: row
            ? hasValidStrategySequence([row]) &&
              meetsCommonStrategyConditions([row])
            : false,
        });
      }
    const readyByStrategy: Record<string, string[]> = Object.fromEntries(
      keys.map((key) => [key, []]),
    );
    const missingPairs: { code: string; date: string }[] = [];
    // Reuse successful completeness checks only within this request. Every
    // new request still checks published daily data and date protections.
    const verifiedDailyDates = new Set<string>();
    const assertDailyReady = async (checkDates: string[]) => {
      if (checkDates.every((date) => verifiedDailyDates.has(date))) return;
      await this.identity.assertReady(checkDates);
      checkDates.forEach((date) => verifiedDailyDates.add(date));
    };
    const firstIndex = Math.max(0, dates.indexOf(visible[0]) - need + 1);
    for (const code of candidateCodes)
      for (const date of dates.slice(firstIndex)) {
        if (
          snapshotDates.has(date) &&
          identity.listed(code, date) &&
          !points.get(code)?.has(date) &&
          !unavailable.get(code)?.has(date)
        )
          missingPairs.push({ code, date });
      }
    if (missingPairs.length) {
      const missingDates = [...new Set(missingPairs.map((p) => p.date))];
      const suspended: DailyEntity[] = await this.db.query(
        "SELECT ts_code tsCode,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,open,close,high,low,vol FROM t_source_daily WHERE ts_code IN (?) AND trade_date IN (?)",
        [
          identity.expand([...new Set(missingPairs.map((p) => p.code))]),
          missingDates,
        ],
      );
      const reported = new Set(
        suspended
          .filter((row) =>
            (['open', 'close', 'high', 'low', 'vol'] as const).every(
              (field) => row[field] != null && Number(row[field]) === 0,
            ),
          )
          .map((row) => `${identity.canonical(row.tsCode)}:${row.tradeDate}`),
      );
      // A missing factor row is only a suspension when a complete daily batch
      // explicitly contains its zero-price, zero-volume placeholder.
      await assertDailyReady([
        ...new Set([...missingDates, ...dates.slice(-3)]),
      ]);
      for (const pair of missingPairs)
        if (reported.has(`${pair.code}:${pair.date}`)) {
          if (!unavailable.has(pair.code))
            unavailable.set(pair.code, new Set());
          unavailable.get(pair.code)!.add(pair.date);
        }
    }
    const items: {
      date: string;
      rows: (DailyEntity & { trendEvidence: any })[];
      key: TrendKey;
    }[] = [];
    for (const date of visible) {
      const index = dates.indexOf(date);
      for (const key of keys) {
        const required = requiredTrendDays(key, options);
        const window = dates.slice(
          Math.max(0, index - required + 1),
          index + 1,
        );
        if (
          window.length < required ||
          window.some((d) => !snapshotDates.has(d))
        ) {
          if (strict)
            throw new ConflictException('策略复权行情尚未补齐，请稍后重试');
          continue;
        }
        const rawDays = dates.slice(
          Math.max(
            0,
            index -
              (key === 'breakoutPullback'
                ? (options.pullbackDays || 10) + (options.volumeDays || 5)
                : options.volumeDays || 5),
          ),
          index + 1,
        );
        try {
          await assertDailyReady(
            rawDays.length >= 3 ? rawDays : dates.slice(index - 2, index + 1),
          );
        } catch (e) {
          if (strict) throw e;
          continue;
        }
        const selected: (DailyEntity & { trendEvidence: any })[] = [];
        let missing = 0;
        for (const code of candidateCodes) {
          const today = rawMap.get(code)!.get(date);
          if (
            !today ||
            !hasValidStrategySequence([today]) ||
            !meetsCommonStrategyConditions([today])
          )
            continue;
          if (!identity.listed(code, window[0])) continue; // Insufficient IPO history is not a zero MA.
          if (window.some((d) => unavailable.get(code)?.has(d))) continue; // Source explicitly reports no usable adjusted price.
          const series = dates
            .slice(0, index + 1)
            .map((d) => points.get(code)?.get(d));
          if (series.slice(-required).some((p) => !p)) {
            missing += 1;
            continue;
          }
          const normalized = normalizeTrendSeries(series, code, required);
          if (!normalized) continue;
          const evidence = evaluateTrend(key, normalized, options);
          if (evidence)
            selected.push(
              Object.assign(new DailyEntity(), today, {
                trendEvidence: { ...evidence, strategy: key },
              }),
            );
        }
        // Missing known-listed candidates must not silently masquerade as no hits.
        if (missing) {
          if (strict)
            throw new ConflictException(
              `策略所需复权行情缺失：${missing}只股票，请补同步后重试`,
            );
          continue;
        }
        readyByStrategy[key].push(date);
        items.push({ date, key, rows: selected });
      }
    }
    return { items, readyByStrategy };
  }

  async list(
    date: string,
    key: TrendKey,
    options: TrendOptions = {},
    codes: string[] | undefined = undefined,
  ) {
    const result = await this.history(
      [date],
      [key],
      { ...TREND_DEFAULTS, ...options },
      codes,
      true,
    );
    return result.items[0]?.rows || [];
  }
}
