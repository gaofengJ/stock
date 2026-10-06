/* eslint-disable no-nested-ternary */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { DataSource, In, LessThan } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { BasicSnapshotEntity } from './snapshot.entity';
import { publicAnnouncements } from './public-announcements';
import { publicReductionPlans } from './public-reduction-plans';
import { compactUnlockRows } from './unlock-calendar';
import {
  CalendarUnpublishedError,
  publicInvestmentCalendar,
  unpublishedCalendar,
} from './investment-calendar';

export interface SourceSnapshot {
  key: string;
  source: string;
  rows: Record<string, any>[];
  fetchedAt: string | null;
  state: 'ready' | 'loading' | 'stale' | 'error' | 'unpublished';
  period?: string;
  message: string | null;
  nextRetryAt?: string | null;
}
const caps: Record<string, number> = {
  stock_company: 4500,
  stock_st: 1000,
  st: 1000,
  suspend_d: 5000,
  stk_shock: 1000,
  stk_high_shock: 1000,
  stk_alert: 1000,
  share_float: 6000,
  disclosure_date: 6000,
  forecast: 3500,
  express: 1000,
  dividend: 2000,
  fina_indicator: 100,
  cashflow: 1000,
  top_inst: 10000,
  stk_holdertrade: 3000,
  anns_d: 2000,
  fina_audit: 1000,
  balancesheet: 1000,
  eastmoney_ann: 100,
  reduction_plans: 3000,
  investment_calendar: 3000,
  eco_cal: 100,
  cn_schedule: 3000,
};

@Injectable()
export class BasicSnapshotService implements OnModuleInit {
  private readonly logger = new Logger(BasicSnapshotService.name);

  private pending = new Set<string>();

  private queue: (() => Promise<void>)[] = [];

  private active = 0;

  private investmentQueue: (() => Promise<void>)[] = [];

  private investmentActive = false;

  private enqueue(job: () => Promise<void>, investment: boolean) {
    (investment ? this.investmentQueue : this.queue).push(job);
  }

  private deferred = new Map<string, number>();

  private nextRequest = 0;

  private writeTail: Promise<unknown> = Promise.resolve();

  private calendarRows = new Map<
    string,
    { version: string; rows: Record<string, any>[] }
  >();

  private preparing = new Set<string>();

  private prepareRetry = new Map<string, number>();

  private calendarQueue: (() => Promise<void>)[] = [];

  private calendarActive = false;

  private drainCalendar() {
    if (this.calendarActive || !this.calendarQueue.length) return;
    this.calendarActive = true;
    this.calendarQueue.shift()!().finally(() => {
      this.calendarActive = false;
      this.drainCalendar();
    });
  }

  /** Read compact calendar projections; prepare missing projections outside the HTTP request. */
  async readCalendarBatch(requests: [string, Record<string, unknown>][]) {
    const keys = requests.map(([source, params]) => this.key(source, params));
    const metadata = await this.db.manager.find(BasicSnapshotEntity, {
      select: {
        snapshotKey: true,
        source: true,
        fetchedAt: true,
        retryAt: true,
        error: true,
        updatedAt: true,
      },
      where: { snapshotKey: In(keys) },
    });
    // Failed refreshes change retry/error metadata but preserve rows and fetchedAt.
    const version = (r: BasicSnapshotEntity) =>
      String(r.fetchedAt?.getTime() || 'empty');
    const projectionKey = (key: string) =>
      createHash('sha256').update(`calendar-v1:${key}`).digest('hex');
    const byKey = new Map(metadata.map((r) => [r.snapshotKey, r]));
    const prepared = new Map<
      string,
      { version: string; rows: Record<string, any>[]; fetchedAt: Date | null }
    >();
    metadata.forEach((r) => {
      if (r.error === unpublishedCalendar) {
        prepared.set(r.snapshotKey, {
          version: version(r),
          rows: [],
          fetchedAt: r.fetchedAt,
        });
        return;
      }
      const memo = this.calendarRows.get(r.snapshotKey);
      if (memo?.version === version(r))
        prepared.set(r.snapshotKey, { ...memo, fetchedAt: r.fetchedAt });
    });
    const missing = metadata.filter((r) => !prepared.has(r.snapshotKey));
    if (missing.length) {
      const records = await this.db.manager.find(BasicSnapshotEntity, {
        where: {
          snapshotKey: In(missing.map((r) => projectionKey(r.snapshotKey))),
        },
      });
      records.forEach((r) => {
        const key = String(r.params.originalKey);
        const v = String(r.params.version);
        prepared.set(key, { version: v, rows: r.rows, fetchedAt: r.fetchedAt });
        if (this.calendarRows.size >= 128)
          this.calendarRows.delete(this.calendarRows.keys().next().value);
        this.calendarRows.set(key, { version: v, rows: r.rows });
      });
    }
    missing
      .filter((r) => prepared.get(r.snapshotKey)?.version !== version(r))
      .forEach((r) => {
        if (
          this.preparing.size >= 80 ||
          this.preparing.has(r.snapshotKey) ||
          (this.prepareRetry.get(r.snapshotKey) || 0) > Date.now()
        )
          return;
        this.preparing.add(r.snapshotKey);
        this.calendarQueue.push(async () => {
          try {
            const original = await this.db.manager.findOneBy(
              BasicSnapshotEntity,
              { snapshotKey: r.snapshotKey },
            );
            if (!original) return;
            const rows: Record<string, any>[] =
              original.source === 'share_float'
                ? compactUnlockRows(original.rows)
                : original.rows.map((row) => {
                    const fields = [
                      'ts_code',
                      'name',
                      'float_date',
                      'actual_date',
                      'pre_date',
                      'ex_date',
                      'ann_date',
                      'imp_ann_date',
                      'end_date',
                      'cash_div_tax',
                      'stk_div',
                      'summary',
                      'perf_summary',
                      'date',
                      'time',
                      'event',
                      'country',
                      'value',
                      'pre_value',
                      'fore_value',
                      'publish_date',
                      'title',
                      'issuing_org',
                      'importance',
                      'sectors',
                    ];
                    return Object.fromEntries(
                      fields
                        .filter((field) => row[field] !== undefined)
                        .map((field) => [field, row[field]]),
                    );
                  });
            if (this.calendarRows.size >= 128)
              this.calendarRows.delete(this.calendarRows.keys().next().value);
            this.calendarRows.set(r.snapshotKey, {
              version: version(original),
              rows,
            });
            await this.writes.withLock((manager) =>
              manager.upsert(
                BasicSnapshotEntity,
                {
                  snapshotKey: projectionKey(r.snapshotKey),
                  source: 'calendar_cache',
                  params: {
                    originalKey: r.snapshotKey,
                    version: version(original),
                  },
                  rows,
                  fetchedAt: original.fetchedAt,
                  retryAt: original.retryAt,
                  error: original.error,
                },
                ['snapshotKey'],
              ),
            );
          } catch {
            if (this.prepareRetry.size >= 128)
              this.prepareRetry.delete(this.prepareRetry.keys().next().value);
            this.prepareRetry.set(r.snapshotKey, Date.now() + 60000);
            this.logger.warn('日历资料整理延后');
          } finally {
            this.preparing.delete(r.snapshotKey);
          }
        });
      });
    setTimeout(() => this.drainCalendar(), 0);
    return Promise.all(
      requests.map(async ([source, params], i) => {
        const r = byKey.get(keys[i]);
        const entry = prepared.get(keys[i]);
        const result = await this.read(
          source,
          params,
          undefined,
          undefined,
          false,
          r ? { ...r, rows: entry?.rows || [] } : null,
        );
        if (r && entry?.version !== version(r)) {
          result.state = this.preparing.has(r.snapshotKey)
            ? 'loading'
            : 'error';
          result.fetchedAt = entry?.fetchedAt?.toISOString() || null;
          result.message =
            result.state === 'loading' ? null : '资料整理延后，可稍后检查更新';
        }
        return result;
      }),
    );
  }

  constructor(
    private db: DataSource,
    private source: TushareService,
    private writes: SyncWriteService,
  ) {}

  onModuleInit() {
    return this.warmReductionPlans();
  }

  @Cron('0 */15 * * * *', { timeZone: 'Asia/Shanghai' })
  async warmReductionPlans() {
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.SCHEDULE_ENABLED === 'false'
    )
      return;
    await this.read('reduction_plans', {}).catch(() =>
      this.logger.warn('当前减持计划缓存预热延后'),
    );
  }

  async read(
    source: string,
    params: Record<string, unknown>,
    fields?: string,
    rowCodes?: string[],
    allMatches?: boolean,
    prefetched?: Pick<
      BasicSnapshotEntity,
      'rows' | 'fetchedAt' | 'retryAt' | 'error'
    > | null,
  ): Promise<SourceSnapshot> {
    if (!caps[source]) throw new Error('Unsupported basic source');
    const snapshotKey = this.key(source, params, fields);
    const cached =
      prefetched !== undefined
        ? prefetched
        : rowCodes?.length
        ? allMatches
          ? await this.readProjectedRows(snapshotKey, rowCodes)
          : await this.readProjected(snapshotKey, rowCodes)
        : await this.db.manager.findOneBy(BasicSnapshotEntity, { snapshotKey });
    return this.readCached(
      source,
      params,
      fields,
      snapshotKey,
      cached,
      rowCodes,
      prefetched !== undefined,
    );
  }

  private key(
    source: string,
    params: Record<string, unknown>,
    fields?: string,
  ) {
    return (
      createHash('sha256')
        // A new namespace forces refetch of legacy snapshots whose Chinese text was lost.
        .update(
          JSON.stringify([
            source,
            params,
            source === 'investment_calendar' ? 'gb18030-v2' : fields || '',
          ]),
        )
        .digest('hex')
    );
  }

  /** One database read for a bounded batch; source fills still use the shared queue. */
  async readBatch(
    source: string,
    params: Record<string, unknown>[],
    fields?: string,
  ) {
    if (!caps[source] || params.length > 200)
      throw new Error('Unsupported snapshot batch');
    if (!params.length) return [];
    const keys = params.map((p) => this.key(source, p, fields));
    const records = await this.db.manager.findBy(BasicSnapshotEntity, {
      snapshotKey: In(keys),
    });
    const cached = new Map(records.map((r) => [r.snapshotKey, r]));
    return Promise.all(
      params.map((p, i) =>
        this.readCached(
          source,
          p,
          fields,
          keys[i],
          cached.get(keys[i]) || null,
        ),
      ),
    );
  }

  private async readCached(
    source: string,
    params: Record<string, unknown>,
    fields: string | undefined,
    snapshotKey: string,
    cached: Pick<
      BasicSnapshotEntity,
      'rows' | 'fetchedAt' | 'retryAt' | 'error'
    > | null,
    rowCodes?: string[],
    projected = false,
  ): Promise<SourceSnapshot> {
    this.deferred.forEach((until, key) => {
      if (until <= Date.now()) this.deferred.delete(key);
    });
    const deferred = this.deferred.has(snapshotKey);
    const due = !cached || cached.retryAt.getTime() <= Date.now();
    const investment = [
      'investment_calendar',
      'eco_cal',
      'cn_schedule',
    ].includes(source);
    if (
      due &&
      !deferred &&
      !this.pending.has(snapshotKey) &&
      this.pending.size < (investment ? 88 : 80)
    ) {
      this.pending.add(snapshotKey);
      this.enqueue(async () => {
        let record: Partial<BasicSnapshotEntity>;
        try {
          const start = Math.max(Date.now(), this.nextRequest);
          this.nextRequest = start + 400;
          await new Promise((resolve) => {
            setTimeout(resolve, start - Date.now());
          });
          const response =
            source === 'investment_calendar'
              ? await publicInvestmentCalendar(params)
              : source === 'reduction_plans'
              ? await publicReductionPlans()
              : source === 'eastmoney_ann'
              ? await publicAnnouncements(params)
              : await this.source.queryData(
                  source,
                  params,
                  fields,
                  caps[source],
                  15000,
                );
          const { data } = response;
          const required =
            source === 'investment_calendar'
              ? ['date', 'title']
              : source === 'eco_cal'
              ? ['date', 'event']
              : source === 'cn_schedule'
              ? ['publish_date', 'title']
              : ['ts_code'];
          if (
            response.code !== 0 ||
            !data ||
            !required.every((field) => data.fields.includes(field))
          )
            throw new Error('来源字段不完整');
          const rows = data.items.map((values) => {
            if (!Array.isArray(values) || values.length !== data.fields.length)
              throw new Error('来源行结构异常');
            return Object.fromEntries(
              data.fields.map((field, i) => [field, values[i]]),
            );
          });
          if (Buffer.byteLength(JSON.stringify(rows)) > 12 * 1024 * 1024)
            throw new Error('来源快照超过体积上限');
          record = {
            rows,
            fetchedAt: new Date(),
            error: null,
            retryAt: new Date(
              Date.now() +
                (source === 'reduction_plans' ? 15 * 60000 : 6 * 3600000),
            ),
          };
        } catch (e) {
          const unpublished =
            source === 'investment_calendar' &&
            e instanceof CalendarUnpublishedError;
          const permission = /权限|积分|每天|每日/.test(String(e?.message));
          record = {
            rows: unpublished ? [] : cached?.rows || [],
            fetchedAt: unpublished ? new Date() : cached?.fetchedAt || null,
            error: unpublished
              ? unpublishedCalendar
              : permission
              ? '数据源权限或日额度不足'
              : '数据源暂不可用',
            retryAt: new Date(
              Date.now() +
                (unpublished ? 6 * 3600000 : permission ? 86400000 : 300000),
            ),
          };
          if (!unpublished) this.logger.warn(`${source}: ${record.error}`);
        }
        try {
          const save = () =>
            this.writes.withLock(
              (manager): Promise<unknown> =>
                // A projected response must never replace the complete cached catalog on failure.
                (rowCodes?.length || projected) && cached && record.error
                  ? manager.update(
                      BasicSnapshotEntity,
                      { snapshotKey },
                      { error: record.error, retryAt: record.retryAt },
                    )
                  : manager.upsert(
                      BasicSnapshotEntity,
                      { ...record, snapshotKey, source, params: params as any },
                      ['snapshotKey'],
                    ),
            );
          const writing = this.writeTail.catch(() => undefined).then(save);
          this.writeTail = writing;
          await writing;
        } catch {
          if (this.deferred.size >= 128)
            this.deferred.delete(this.deferred.keys().next().value);
          this.deferred.set(snapshotKey, Date.now() + 60000);
          this.logger.warn('基础资料缓存写入延后，暂停重复请求');
        } finally {
          this.pending.delete(snapshotKey);
        }
      }, investment);
      this.drain();
    }
    return {
      key: snapshotKey,
      source,
      ...(source === 'investment_calendar'
        ? { period: String(params.month).replace(/^(\d{4})(\d{2})$/, '$1-$2') }
        : {}),
      rows: cached?.rows || [],
      fetchedAt: cached?.fetchedAt?.toISOString() || null,
      state:
        cached?.error === unpublishedCalendar
          ? 'unpublished'
          : cached?.fetchedAt
          ? due || cached.error
            ? 'stale'
            : 'ready'
          : deferred || (cached?.error && !due)
          ? 'error'
          : 'loading',
      message:
        cached?.error === unpublishedCalendar
          ? '日程尚未发布'
          : deferred
          ? '数据同步中，稍后可刷新'
          : this.pending.has(snapshotKey)
          ? null
          : cached?.error || null,
      nextRetryAt: cached?.error && !due ? cached.retryAt.toISOString() : null,
    };
  }

  private async readProjected(snapshotKey: string, codes: string[]) {
    const projections = codes.map(
      (_, index) =>
        `JSON_EXTRACT(data, REPLACE(JSON_UNQUOTE(JSON_SEARCH(data, 'one', ?, NULL, '$[*].ts_code')), '.ts_code', '')) row${index}`,
    );
    const [record] = await this.db.query(
      `SELECT fetched_at fetchedAt,retry_at retryAt,error,${projections.join(
        ',',
      )} FROM t_source_basic_snapshot WHERE snapshot_key=?`,
      [...codes, snapshotKey],
    );
    if (!record) return null;
    return {
      fetchedAt: record.fetchedAt ? new Date(record.fetchedAt) : null,
      retryAt: new Date(record.retryAt),
      error: record.error,
      rows: codes
        .map((_, index) => record[`row${index}`])
        .filter(Boolean)
        .map((value) =>
          typeof value === 'string' ? JSON.parse(value) : value,
        ),
    };
  }

  /** Keep every event for this stock, including old-code records, without transferring the market snapshot. */
  private async readProjectedRows(
    snapshotKey: string,
    codes: string[],
    attempt = 0,
  ): Promise<{
    fetchedAt: Date | null;
    retryAt: Date;
    error: string | null;
    rows: Record<string, any>[];
  } | null> {
    const list = (value: any) => {
      const parsed =
        typeof value === 'string' && !value.startsWith('$')
          ? JSON.parse(value)
          : value;
      if (parsed == null) return [];
      return Array.isArray(parsed) ? parsed : [parsed];
    };
    const [record] = await this.db.query(
      `SELECT fetched_at fetchedAt,retry_at retryAt,error,${codes
        .map(
          (_, index) =>
            `JSON_SEARCH(data,'all',?,NULL,'$[*].ts_code') paths${index}`,
        )
        .join(',')} FROM t_source_basic_snapshot WHERE snapshot_key=?`,
      [...codes, snapshotKey],
    );
    if (!record) return null;
    const paths = [
      ...new Set(codes.flatMap((_, index) => list(record[`paths${index}`]))),
    ]
      .filter((path) => /^\$\[\d+\]\.ts_code$/.test(path))
      .map((path: string) => path.replace(/\.ts_code$/, ''));
    let rows: Record<string, any>[] = [];
    if (paths.length) {
      const [projected] = await this.db.query(
        `SELECT JSON_EXTRACT(data,${paths.map(() => '?').join(',')}) rows
         FROM t_source_basic_snapshot WHERE snapshot_key=? AND fetched_at <=> ?`,
        [...paths, snapshotKey, record.fetchedAt],
      );
      if (!projected) {
        if (!attempt) return this.readProjectedRows(snapshotKey, codes, 1);
        throw new Error('资料正在更新，请稍后重试');
      }
      rows = list(projected.rows).filter((row) => codes.includes(row.ts_code));
    }
    return {
      fetchedAt: record.fetchedAt ? new Date(record.fetchedAt) : null,
      retryAt: new Date(record.retryAt),
      error: record.error,
      rows,
    };
  }

  private drain() {
    // Global calendars get one reserved slot; all source requests still share the 400ms rate budget.
    if (!this.investmentActive && this.investmentQueue.length) {
      this.investmentActive = true;
      this.investmentQueue.shift()!()
        .catch(() => this.logger.warn('投资日历暂未写入'))
        .finally(() => {
          this.investmentActive = false;
          this.drain();
        });
    }
    while (this.active < 2 && this.queue.length) {
      this.active += 1;
      const job = this.queue.shift()!;
      job()
        .catch(() => this.logger.warn('基础资料快照暂未写入'))
        .finally(() => {
          this.active -= 1;
          this.drain();
        });
    }
  }

  @Cron('0 15 4 * * *', { timeZone: 'Asia/Shanghai' })
  async prune() {
    if (
      process.env.SCHEDULE_ENABLED === 'false' ||
      process.env.NODE_ENV !== 'production'
    )
      return;
    await this.writes
      .withLock((manager) =>
        manager.delete(BasicSnapshotEntity, {
          updatedAt: LessThan(new Date(Date.now() - 120 * 86400000)),
        }),
      )
      .catch(() => this.logger.warn('基础资料缓存清理延后'));
  }
}
