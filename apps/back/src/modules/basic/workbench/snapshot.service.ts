/* eslint-disable no-nested-ternary */
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { DataSource, LessThan } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { BasicSnapshotEntity } from './snapshot.entity';
import { publicAnnouncements } from './public-announcements';

export interface SourceSnapshot {
  key: string;
  source: string;
  rows: Record<string, any>[];
  fetchedAt: string | null;
  state: 'ready' | 'loading' | 'stale' | 'error';
  message: string | null;
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
};

@Injectable()
export class BasicSnapshotService {
  private readonly logger = new Logger(BasicSnapshotService.name);

  private pending = new Set<string>();

  private queue: (() => Promise<void>)[] = [];

  private active = 0;

  private deferred = new Map<string, number>();

  private nextRequest = 0;

  private writeTail: Promise<unknown> = Promise.resolve();

  constructor(
    private db: DataSource,
    private source: TushareService,
    private writes: SyncWriteService,
  ) {}

  async read(
    source: string,
    params: Record<string, unknown>,
    fields?: string,
    rowCodes?: string[],
  ): Promise<SourceSnapshot> {
    if (!caps[source]) throw new Error('Unsupported basic source');
    const snapshotKey = createHash('sha256')
      .update(JSON.stringify([source, params, fields || '']))
      .digest('hex');
    const cached = rowCodes?.length
      ? await this.readProjected(snapshotKey, rowCodes)
      : await this.db.manager.findOneBy(BasicSnapshotEntity, { snapshotKey });
    this.deferred.forEach((until, key) => {
      if (until <= Date.now()) this.deferred.delete(key);
    });
    const deferred = this.deferred.has(snapshotKey);
    const due = !cached || cached.retryAt.getTime() <= Date.now();
    if (
      due &&
      !deferred &&
      !this.pending.has(snapshotKey) &&
      this.pending.size < 80
    ) {
      this.pending.add(snapshotKey);
      this.queue.push(async () => {
        let record: Partial<BasicSnapshotEntity>;
        try {
          const start = Math.max(Date.now(), this.nextRequest);
          this.nextRequest = start + 400;
          await new Promise((resolve) => {
            setTimeout(resolve, start - Date.now());
          });
          const response =
            source === 'eastmoney_ann'
              ? await publicAnnouncements(params)
              : await this.source.queryData(
                  source,
                  params,
                  fields,
                  caps[source],
                  15000,
                );
          const { data } = response;
          if (response.code !== 0 || !data || !data.fields.includes('ts_code'))
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
            retryAt: new Date(Date.now() + 6 * 3600000),
          };
        } catch (e) {
          const permission = /权限|积分|每天|每日/.test(String(e?.message));
          record = {
            rows: cached?.rows || [],
            fetchedAt: cached?.fetchedAt || null,
            error: permission ? '数据源权限或日额度不足' : '数据源暂不可用',
            retryAt: new Date(Date.now() + (permission ? 86400000 : 300000)),
          };
          this.logger.warn(`${source}: ${record.error}`);
        }
        try {
          const save = () =>
            this.writes.withLock(
              (manager): Promise<unknown> =>
                // A projected response must never replace the complete cached catalog on failure.
                rowCodes?.length && cached && record.error
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
      });
      this.drain();
    }
    return {
      key: snapshotKey,
      source,
      rows: cached?.rows || [],
      fetchedAt: cached?.fetchedAt?.toISOString() || null,
      state: cached?.fetchedAt
        ? due || cached.error
          ? 'stale'
          : 'ready'
        : deferred || (cached?.error && !due)
        ? 'error'
        : 'loading',
      message: deferred
        ? '数据同步中，稍后可刷新'
        : this.pending.has(snapshotKey)
        ? null
        : cached?.error || null,
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

  private drain() {
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
