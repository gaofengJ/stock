/* eslint-disable no-await-in-loop, no-restricted-syntax -- 数据采集按批次串行，遵守同花顺接口限频。 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Between, DataSource, EntityManager, LessThanOrEqual } from 'typeorm';
import * as dayjs from 'dayjs';
import { TushareService } from '@/shared/tushare/tushare.service';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { readSnapshot } from '@/modules/daily-task/sync-source.service';
import {
  normalizeDate,
  permanentSyncError,
  shanghaiDate,
} from '@/modules/daily-task/sync.utils';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { BseMappingEntity } from './market.entity';
import { MarketSyncService } from './market-sync.service';
import {
  SectorEntity,
  SectorDailyEntity,
  SectorMembersEntity,
} from './sector.entity';
import { SectorQueryDto } from './sector.dto';
import { competitionRanks, primarySector, sectorReturn } from './sector.utils';
import { AsyncTtlCache } from '../async-ttl-cache';

type SectorLink = { code: string; name: string; type: 'I' | 'N'; asOf: string };
@Injectable()
export class SectorService {
  private readonly memberCache = new AsyncTtlCache(30000);

  private readonly boardCache = new AsyncTtlCache(30000);

  constructor(
    private db: DataSource,
    private source: TushareService,
    private writes: SyncWriteService,
    private sync: MarketSyncService,
  ) {}

  async enqueue(manager: EntityManager, end: string) {
    if (!this.db.hasMetadata(SectorEntity)) return;
    const start = dayjs(end).subtract(2, 'year').format('YYYY-MM-DD');
    const [failed] = await manager.query(
      "SELECT error,updated_at updatedAt FROM t_admin_job WHERE mode='sector' AND actor_id IS NULL AND status='failed' ORDER BY id DESC LIMIT 1",
    );
    if (
      failed &&
      permanentSyncError(failed.error || '') &&
      shanghaiDate(failed.updatedAt) === shanghaiDate()
    )
      return;
    await manager.query(
      "INSERT INTO t_admin_job(actor_id,actor_name,start_date,end_date,status,active_key,mode,stage) VALUES(NULL,'同花顺板块同步',?,?,'queued','ths-sectors-two-years','sector','等待更新同花顺板块') ON DUPLICATE KEY UPDATE end_date=GREATEST(end_date,VALUES(end_date))",
      [start, end],
    );
  }

  private async catalog(manager: EntityManager, asOf: string) {
    const existing = await manager.findBy(SectorEntity, { active: true });
    const done = await manager.findOneBy(SyncRunEntity, {
      task: 'ths-catalog',
      tradeDate: asOf,
      status: 'success',
    });
    if (existing.length && done) return existing;
    await this.sync.stage(manager, 'ths-catalog', asOf, async () => {
      const rows = readSnapshot(
        await this.source.queryData(
          'ths_index',
          { exchange: 'A' },
          'ts_code,name,count,type',
          5000,
          15000,
        ),
        ['ts_code', 'name', 'type'],
      );
      const selected = rows.filter(
        (r) => primarySector(r as any) && Number(r.count) > 0,
      );
      if (
        !selected.some((r) => r.type === 'I') ||
        !selected.some((r) => r.type === 'N') ||
        new Set(selected.map((r) => r.tsCode)).size !== selected.length
      )
        throw new Error('同花顺分类目录不完整或重复');
      await manager.transaction(async (tx) => {
        await tx.update(SectorEntity, {}, { active: false });
        await tx.upsert(
          SectorEntity,
          selected.map((r) => ({
            tsCode: r.tsCode,
            name: r.name,
            type: r.type,
            count: Number(r.count),
            active: true,
          })),
          ['tsCode'],
        );
      });
    });
    return manager.findBy(SectorEntity, { active: true });
  }

  private async daily(
    manager: EntityManager,
    date: string,
    sectors: SectorEntity[],
  ) {
    if (await this.writes.excluded(manager, date))
      throw new Error('该日受主动删除保护');
    await this.sync.stage(manager, 'ths-daily', date, async () => {
      const response = await this.source.queryData(
        'ths_daily',
        { trade_date: date.replace(/-/g, '') },
        'ts_code,trade_date,open,high,low,close,pre_close,pct_change,vol',
        3000,
        15000,
      );
      const rows = readSnapshot(response, [
        'ts_code',
        'trade_date',
        'open',
        'close',
        'high',
        'low',
      ]);
      if (
        ['pre_close', 'pct_change', 'vol'].some(
          (field) => !response.data?.fields.includes(field),
        )
      )
        throw new Error('同花顺板块日线缺少必需字段');
      const codes = new Set(sectors.map((s) => s.tsCode));
      // 新概念启动前返回基点占位：四价相同且昨收、涨幅、量全空。保留缺失，不伪造零涨幅。
      const selected = rows.filter(
        (r) =>
          codes.has(r.tsCode) &&
          !(
            r.preClose == null &&
            r.pctChange == null &&
            r.vol == null &&
            r.open === r.close &&
            r.open === r.high &&
            r.open === r.low
          ),
      );
      if (
        !selected.length ||
        new Set(selected.map((r) => r.tsCode)).size !== selected.length
      )
        throw new Error('同花顺板块日线为空或重复');
      const values = selected.map((r) => {
        if (r.tradeDate !== date.replace(/-/g, ''))
          throw new Error('同花顺板块日线日期不匹配');
        const data = Object.fromEntries(
          ['open', 'close', 'high', 'low', 'preClose', 'pctChange', 'vol'].map(
            (key) => [
              key,
              r[key] == null || r[key] === '' ? null : Number(r[key]),
            ],
          ),
        ) as SectorDailyEntity['data'];
        if (
          (['open', 'close', 'high', 'low', 'preClose'] as const).some(
            (key) => !Number.isFinite(data[key]) || data[key] <= 0,
          ) ||
          !Number.isFinite(data.pctChange) ||
          !Number.isFinite(data.vol) ||
          data.vol < 0 ||
          data.high < Math.max(data.open, data.close) ||
          data.low > Math.min(data.open, data.close)
        )
          throw new Error('同花顺板块日线数值异常');
        return { tradeDate: date, tsCode: r.tsCode, data };
      });
      await manager.transaction(async (tx) => {
        await tx.delete(SectorDailyEntity, { tradeDate: date });
        await tx.insert(SectorDailyEntity, values);
      });
    });
  }

  private async members(
    manager: EntityManager,
    sector: SectorEntity,
    asOf: string,
  ) {
    const rows = readSnapshot(
      await this.source.queryData(
        'ths_member',
        { ts_code: sector.tsCode },
        'ts_code,con_code,con_name,is_new',
        5000,
        15000,
      ),
      ['ts_code', 'con_code', 'con_name'],
    );
    const mapping = new Map(
      (await manager.find(BseMappingEntity)).map((r) => [r.oldCode, r.newCode]),
    );
    const map = new Map<string, { code: string; name: string }>();
    rows
      .filter((r) => r.isNew !== 'N')
      .forEach((r) => {
        if (
          r.tsCode !== sector.tsCode ||
          !/^\d{6}\.(SH|SZ|BJ|NQ)$/.test(r.conCode)
        )
          throw new Error('同花顺成分代码异常');
        // 同花顺少量 A 股概念含新三板成分；平台只统计沪深北 A 股。
        if (r.conCode.endsWith('.NQ')) return;
        const code = mapping.get(r.conCode) || r.conCode;
        map.set(code, { code, name: r.conName });
      });
    if (
      !map.size ||
      rows.filter((r) => r.isNew !== 'N').length < sector.count * 0.8
    )
      throw new Error(`${sector.name}成分覆盖不足，保留已有快照`);
    await manager.upsert(
      SectorMembersEntity,
      { asOf, tsCode: sector.tsCode, members: [...map.values()] },
      ['asOf', 'tsCode'],
    );
  }

  async batch(start: string, end: string) {
    normalizeDate(start);
    normalizeDate(end);
    return this.writes.withLock(
      async (manager) => {
        const asOf = shanghaiDate();
        const sectors = await this.catalog(manager, asOf);
        const pending: { date: string }[] = await manager.query(
          `SELECT DATE_FORMAT(r.trade_date,'%Y-%m-%d') date FROM t_sync_run r LEFT JOIN t_sync_run s ON s.task='ths-daily' AND s.trade_date=r.trade_date AND s.status='success' LEFT JOIN t_sync_day_policy p ON p.trade_date=r.trade_date WHERE r.task='market' AND r.status='success' AND r.trade_date BETWEEN ? AND ? AND s.id IS NULL AND p.trade_date IS NULL ORDER BY r.trade_date DESC`,
          [start, end],
        );
        const snapshots = new Set(
          (
            await manager.find(SectorMembersEntity, {
              where: { asOf },
              select: { tsCode: true },
            })
          ).map((s) => s.tsCode),
        );
        const due = sectors
          .filter((s) => !snapshots.has(s.tsCode))
          .sort(
            (a, b) =>
              a.type.localeCompare(b.type) || a.tsCode.localeCompare(b.tsCode),
          );
        const completed: string[] = [];
        const failures: string[] = [];
        // 最新日先发布。成分按真实采集日留快照，不伪造两年前的成分。
        const fetchDay = async (date: string) => {
          try {
            await this.daily(manager, date, sectors);
            completed.push(date);
          } catch (e) {
            failures.push(`${date}: ${e.message}`);
          }
        };
        if (pending.length) await fetchDay(pending[0].date);
        if (!failures.some(permanentSyncError)) {
          for (const sector of due.slice(0, 12)) {
            await new Promise((resolve) => {
              setTimeout(resolve, 350);
            });
            try {
              await this.members(manager, sector, asOf);
              snapshots.add(sector.tsCode);
            } catch (e) {
              failures.push(`${sector.name}: ${e.message}`);
              if (permanentSyncError(e)) break;
            }
          }
          for (const row of pending.slice(1, due.length ? 3 : 6)) {
            if (failures.some(permanentSyncError)) break;
            await fetchDay(row.date);
          }
        }
        const memberRemaining = sectors.filter(
          (s) => !snapshots.has(s.tsCode),
        ).length;
        const daysRemaining = pending.length - completed.length;
        return {
          completed,
          failures,
          remaining: daysRemaining + memberRemaining,
          stage: `成分 ${snapshots.size}／${sectors.length} 个板块，日线待补 ${daysRemaining} 个交易日`,
          protectedDates: [] as string[],
          calendarReady: true,
        };
      },
      true,
      true,
    );
  }

  async links(codes?: string[], date?: string) {
    if (!this.db.hasMetadata(SectorMembersEntity))
      return new Map<string, SectorLink[]>();
    const sectors = await this.db.manager.findBy(SectorEntity, {
      active: true,
    });
    const result = new Map<string, SectorLink[]>();
    const wanted = codes && new Set(codes);
    const snapshots = (
      await Promise.all([
        this.snapshots(date, undefined, false, 'I'),
        this.snapshots(date, undefined, false, 'N'),
      ])
    ).flat();
    const catalog = new Map(sectors.map((s) => [s.tsCode, s]));
    const mapping = new Map(
      (await this.db.manager.find(BseMappingEntity)).map((r) => [
        r.oldCode,
        r.newCode,
      ]),
    );
    const reverse = new Map<string, string[]>();
    mapping.forEach((current, old) =>
      reverse.set(current, [...(reverse.get(current) || []), old]),
    );
    snapshots.forEach((s) => {
      const sector = catalog.get(s.tsCode);
      if (!sector) return;
      s.members.forEach((m) => {
        const aliases = [m.code, ...(reverse.get(m.code) || [])];
        aliases.forEach((code) => {
          if (!wanted || wanted.has(code))
            result.set(code, [
              ...(result.get(code) || []),
              {
                code: sector.tsCode,
                name: sector.name,
                type: sector.type,
                asOf: s.asOf,
              },
            ]);
        });
      });
    });
    return result;
  }

  /** A single profile needs matching board labels, not every board's member list. */
  async stockLinks(codes: string[], date: string): Promise<SectorLink[]> {
    if (!this.db.hasMetadata(SectorMembersEntity) || !codes.length) return [];
    return this.memberCache.getOrCreate(
      `stock:${date}:${codes.join(',')}`,
      () =>
        this.db.query(
          `SELECT c.ts_code code,c.name,c.type,DATE_FORMAT(s.as_of,'%Y-%m-%d') asOf
         FROM t_source_ths_members s
         JOIN (SELECT ts_code,COALESCE(MAX(CASE WHEN as_of<=? THEN as_of ELSE NULL END),MIN(as_of)) as_of FROM t_source_ths_members GROUP BY ts_code) chosen ON s.ts_code=chosen.ts_code AND s.as_of=chosen.as_of
         JOIN t_source_ths_sector c ON c.ts_code=s.ts_code AND c.active=1
         WHERE (${codes
           .map(
             () =>
               "JSON_SEARCH(s.members,'one',?,NULL,'$[*].code') IS NOT NULL",
           )
           .join(' OR ')})
         ORDER BY c.type,c.ts_code`,
          [date, ...codes],
        ),
    );
  }

  async decorate<T extends { tsCode?: string; industry?: any }>(
    rows: T[],
    date?: string,
  ): Promise<(T & { industries: SectorLink[]; topics: SectorLink[] })[]> {
    const links = await this.links(
      rows.map((r) => r.tsCode!).filter(Boolean),
      date,
    );
    return rows.map((r) => {
      const classified = links.get(r.tsCode!) || [];
      const industries = classified.filter((s) => s.type === 'I');
      return {
        ...r,
        industry: industries.map((s) => s.name).join('／'),
        industries,
        topics: classified.filter((s) => s.type === 'N'),
      };
    });
  }

  async snapshots(
    date?: string,
    code?: string,
    names?: boolean,
    kind?: 'I' | 'N',
  ) {
    // 使用截至所选日期的最近快照；首次采集以前用最早的可用快照，显式标出成分日期。
    const day = date || shanghaiDate();
    return this.memberCache.getOrCreate(
      `${day}:${code || ''}:${names}:${kind || ''}`,
      async () => {
        const kinds = {
          I: "AND s.ts_code LIKE '881%'",
          N: "AND (s.ts_code LIKE '885%' OR s.ts_code LIKE '886%')",
        };
        let where = '';
        if (kind) where = kinds[kind];
        if (code) where = 'AND s.ts_code=?';
        const rows: {
          tsCode: string;
          asOf: string;
          members?: SectorMembersEntity['members'];
          codes?: string[];
        }[] = await this.db.query(
          `SELECT s.ts_code tsCode,DATE_FORMAT(s.as_of,'%Y-%m-%d') asOf,${
            names
              ? 's.members members'
              : "JSON_EXTRACT(s.members,'$[*].code') codes"
          } FROM t_source_ths_members s JOIN (SELECT ts_code,COALESCE(MAX(CASE WHEN as_of<=? THEN as_of ELSE NULL END),MIN(as_of)) as_of FROM t_source_ths_members GROUP BY ts_code) chosen ON s.ts_code=chosen.ts_code AND s.as_of=chosen.as_of WHERE 1=1 ${where}`,
          [day, ...(code ? [code] : [])],
        );
        return rows.map((row) => ({
          tsCode: row.tsCode,
          asOf: row.asOf,
          members: names
            ? row.members!
            : (row.codes || []).map((memberCode) => ({
                code: memberCode,
                name: '',
              })),
        }));
      },
    );
  }

  async codes(code: string, date?: string) {
    const [snapshot] = await this.snapshots(date, code);
    const codes = new Set(snapshot?.members.map((m) => m.code) || []);
    (await this.db.manager.find(BseMappingEntity)).forEach((r) => {
      if (codes.has(r.newCode)) codes.add(r.oldCode);
    });
    return codes;
  }

  async options() {
    const items = await this.db.manager.findBy(SectorEntity, { active: true });
    const [snapshot] = await this.db.query(
      "SELECT DATE_FORMAT(MAX(as_of),'%Y-%m-%d') asOf FROM t_source_ths_members",
    );
    return {
      items: items.map((s) => ({ code: s.tsCode, name: s.name, type: s.type })),
      asOf: snapshot?.asOf || null,
    };
  }

  async board(q: SectorQueryDto) {
    return this.boardCache.getOrCreate(JSON.stringify(q), () =>
      this.calculateBoard(q),
    );
  }

  async signalCounts(date: string, hits: Map<string, string[]>) {
    const snapshots = await this.snapshots(date);
    return snapshots.map((snapshot) => {
      const codes = [...new Set(snapshot.members.map((r) => r.code))];
      const strategies = [
        ...new Set(codes.flatMap((code) => hits.get(code) || [])),
      ].map((key) => ({
        key,
        count: codes.filter((code) => hits.get(code)?.includes(key)).length,
      }));
      return {
        code: snapshot.tsCode,
        count: codes.filter((code) => hits.has(code)).length,
        strategies,
      };
    });
  }

  async candidateContext<T extends { tsCode: string }>(
    rows: T[],
    date: string,
  ) {
    if (!rows.length) return rows;
    const decorated = await this.decorate(rows, date);
    const boards = await Promise.all(
      (['I', 'N'] as const).map((kind) =>
        this.board({
          date,
          kind,
          period: 1,
          days: 20,
          scope: 'all',
        } as SectorQueryDto),
      ),
    ).catch(() => null);
    const metrics = new Map(
      (boards || []).flatMap((b) => b.items).map((s) => [s.code, s]),
    );
    return decorated.map((row) => ({
      ...row,
      sectorContextReady: !!boards,
      sectorPerformance: [...row.industries, ...row.topics].map((link) => ({
        ...link,
        day: metrics.get(link.code)?.day ?? null,
        five: metrics.get(link.code)?.five ?? null,
        twenty: metrics.get(link.code)?.twenty ?? null,
        maxHeight: metrics.get(link.code)?.maxHeight ?? null,
      })),
    }));
  }

  private async calculateBoard(q: SectorQueryDto) {
    if (!q.date) throw new BadRequestException('请选择交易日');
    normalizeDate(q.date);
    const { date } = q;
    const sectors = await this.db.manager.findBy(SectorEntity, {
      type: q.kind,
      active: true,
    });
    const calendar = await this.db.manager.find(TradeCalEntity, {
      where: { isOpen: 1, calDate: LessThanOrEqual(q.date) },
      order: { calDate: 'DESC' },
      take: Math.max(q.days === 730 ? 500 : q.days, 60) + 21,
    });
    const dates = calendar.map((r) => r.calDate).reverse();
    const first = dates[0] || q.date;
    // 排行和轮动只需要收盘及涨幅，避免把所有板块的完整 JSON 行情从数据库传回。
    const points: {
      tsCode: string;
      tradeDate: string;
      close: number;
      pctChange: number;
    }[] = await this.db.query(
      `SELECT ts_code tsCode,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,JSON_UNQUOTE(JSON_EXTRACT(data,'$.close')) close,JSON_UNQUOTE(JSON_EXTRACT(data,'$.pctChange')) pctChange FROM t_source_ths_daily WHERE trade_date BETWEEN ? AND ? AND ${
        q.kind === 'I'
          ? "ts_code LIKE '881%'"
          : "(ts_code LIKE '885%' OR ts_code LIKE '886%')"
      }`,
      [dates[Math.max(0, dates.length - 40)] || first, date],
    );
    const chartPoints = q.code
      ? await this.db.manager.find(SectorDailyEntity, {
          where: { tsCode: q.code, tradeDate: Between(first, q.date) },
          order: { tradeDate: 'ASC' },
        })
      : [];
    const byKey = new Map(
      points.map((p) => [
        `${p.tsCode}:${p.tradeDate}`,
        { close: Number(p.close), pctChange: Number(p.pctChange) },
      ]),
    );
    const at = (code: string, tradingDate: string) =>
      byKey.get(`${code}:${tradingDate}`);
    const returns = (code: string, tradingDate: string, period: number) =>
      period === 1
        ? at(code, tradingDate)?.pctChange ?? null
        : sectorReturn(
            at(code, tradingDate)?.close,
            at(code, dates[dates.indexOf(tradingDate) - period])?.close,
          );
    const [members, daily, limits, mapping] = await Promise.all([
      this.snapshots(q.date, undefined, false, q.kind),
      this.db.manager.find(DailyEntity, {
        where: { tradeDate: q.date },
        select: { tsCode: true, close: true, pctChg: true, amount: true },
      }),
      this.db.manager.findBy(LimitEntity, { tradeDate: q.date, limit: 'U' }),
      this.db.manager.find(BseMappingEntity),
    ]);
    const aliases = new Map(mapping.map((r) => [r.oldCode, r.newCode]));
    const canonical = (c: string) => aliases.get(c) || c;
    const stocks = new Map(
      daily
        .filter((r) => Number(r.amount) > 0)
        .map((r) => [canonical(r.tsCode), r]),
    );
    const published = !!(await this.db.manager.findOneBy(SyncRunEntity, {
      task: 'market',
      tradeDate: date,
      status: 'success',
    }));
    const stockDataReady = published && daily.length > 0;
    if (!stockDataReady) stocks.clear();
    const upCodes = new Set(
      stockDataReady ? limits.map((r) => canonical(r.tsCode)) : [],
    );
    const heights = new Map(
      limits.map((r) => [canonical(r.tsCode), r.limitTimes || 0]),
    );
    const totalAmount = [...stocks.values()].reduce(
      (sum, r) => sum + Number(r.amount),
      0,
    );
    const membersByCode = new Map(members.map((s) => [s.tsCode, s]));
    const items = sectors.map((s) => {
      const snapshot = membersByCode.get(s.tsCode);
      const traded =
        snapshot?.members.map((m) => stocks.get(m.code)).filter(Boolean) || [];
      return {
        code: s.tsCode,
        name: s.name,
        type: s.type,
        asOf: snapshot?.asOf || null,
        price: at(s.tsCode, date) || null,
        day: returns(s.tsCode, date, 1),
        five: returns(s.tsCode, date, 5),
        twenty: returns(s.tsCode, date, 20),
        memberCount: snapshot?.members.length ?? null,
        traded: snapshot && stockDataReady ? traded.length : null,
        upRatio: traded.length
          ? (traded.filter((r) => Number(r!.pctChg) > 0).length /
              traded.length) *
            100
          : null,
        limitUp:
          snapshot && stockDataReady
            ? snapshot.members.filter((m) => upCodes.has(m.code)).length
            : null,
        amount:
          snapshot && stockDataReady
            ? traded.reduce((sum, r) => sum + Number(r!.amount), 0) / 100000
            : null,
        amountShare:
          snapshot && stockDataReady && totalAmount > 0
            ? (traded.reduce((sum, r) => sum + Number(r!.amount), 0) /
                totalAmount) *
              100
            : null,
        maxHeight:
          snapshot && stockDataReady
            ? Math.max(
                0,
                ...snapshot.members.map((m) => heights.get(m.code) || 0),
              )
            : null,
      };
    });
    const rankingDates = dates.slice(-20);
    const rotation = rankingDates.map((tradingDate) => {
      const values = sectors.map((s) => ({
        code: s.tsCode,
        value: returns(s.tsCode, tradingDate, q.period),
      }));
      const ranks = competitionRanks(values);
      return {
        date: tradingDate,
        total: ranks.size,
        values: values.map((r) => ({ ...r, rank: ranks.get(r.code) ?? null })),
      };
    });
    const detailSector = sectors.find((s) => s.tsCode === q.code);
    const snapshot = q.code
      ? (await this.snapshots(q.date, q.code, true))[0]
      : undefined;
    const detail = detailSector
      ? {
          code: detailSector.tsCode,
          name: detailSector.name,
          asOf: snapshot?.asOf || null,
          series: chartPoints.map((p) => ({
            date: p.tradeDate,
            ...p.data,
            pctChg: p.data.pctChange,
            amount: 0,
          })),
          members: snapshot
            ? await this.decorate(
                snapshot.members.map((m) => ({
                  tsCode: m.code,
                  name: m.name,
                  close: stocks.get(m.code)?.close ?? null,
                  pctChg: stocks.get(m.code)?.pctChg ?? null,
                  amount: stocks.get(m.code)?.amount ?? null,
                  limitUp: upCodes.has(m.code),
                })),
                q.date,
              )
            : [],
        }
      : null;
    const [job] = await this.db.query(
      "SELECT status,stage,error FROM t_admin_job WHERE mode='sector' ORDER BY id DESC LIMIT 1",
    );
    return {
      date: q.date,
      kind: q.kind,
      period: q.period,
      dates: dates.slice(-(q.days === 730 ? 500 : q.days)),
      items,
      rotation,
      detail,
      job: job || null,
    };
  }
}
