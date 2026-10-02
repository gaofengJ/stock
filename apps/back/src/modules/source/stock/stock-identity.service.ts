/* eslint-disable no-await-in-loop, no-restricted-syntax, no-continue */
import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { normalizeDate, shanghaiDate } from '@/modules/daily-task/sync.utils';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { SyncDayPolicyEntity } from '@/modules/daily-task/sync-day-policy.entity';
import { StockEntity } from './stock.entity';
import { HistoricalName, StockHistoryEntity } from './stock-history.entity';
import { DailyEntity } from '../daily/daily.entity';

const stockCode = /^\d{6}\.(SH|SZ|BJ)$/;

function sourceDate(value: unknown): string {
  const text = String(value);
  return normalizeDate(text.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
}

export function readIdentityRows(
  response: any,
  fields: string[],
  allowEmpty = false,
) {
  const data = response?.data;
  if (
    response?.code !== 0 ||
    !Array.isArray(data?.fields) ||
    !Array.isArray(data?.items) ||
    fields.some((field) => !data.fields.includes(field)) ||
    (!allowEmpty && !data.items.length)
  )
    throw new Error('股票历史信息快照不完整');
  return data.items.map((values: unknown[]) => {
    if (!Array.isArray(values) || values.length !== data.fields.length)
      throw new Error('股票历史信息行结构异常');
    return Object.fromEntries(
      data.fields.map((field: string, i: number) => [field, values[i]]),
    );
  });
}

export function identityIndex(
  snapshot: StockHistoryEntity,
  mapping: Pick<BseMappingEntity, 'oldCode' | 'newCode'>[],
) {
  const aliases = new Map(mapping.map((row) => [row.oldCode, row.newCode]));
  const canonical = (code: string) => aliases.get(code) || code;
  const stocks = new Map<string, (typeof snapshot.data.stocks)[number]>();
  snapshot.data.stocks.forEach((stock) => {
    const code = canonical(stock.tsCode);
    if (!stocks.has(code) || stock.tsCode === code) stocks.set(code, stock);
  });
  const names = new Map<string, HistoricalName[]>();
  snapshot.data.names.forEach((name) => {
    const code = canonical(name.tsCode);
    names.set(code, [...(names.get(code) || []), name]);
  });
  names.forEach((periods) =>
    periods.sort((a, b) => b.startDate.localeCompare(a.startDate)),
  );
  return {
    canonical,
    expand(codes: string[]) {
      const selected = new Set(codes.map(canonical));
      mapping.forEach((row) => {
        if (selected.has(row.newCode)) selected.add(row.oldCode);
      });
      return [...selected];
    },
    name(code: string, date: string): string {
      const key = canonical(code);
      const stock = stocks.get(key);
      if (
        !stock ||
        stock.listDate > date ||
        (stock.delistDate && date >= stock.delistDate)
      )
        return '';
      const period = names
        .get(key)
        ?.find(
          (row) =>
            row.startDate <= date && (!row.endDate || row.endDate >= date),
        );
      // Historical gaps must not be filled with a present-day ST/name status.
      const name = period?.name || (date === snapshot.asOf ? stock.name : '');
      return date === stock.listDate && name ? `N${name}` : name;
    },
    listed(code: string, date: string) {
      const stock = stocks.get(canonical(code));
      return (
        !!stock &&
        stock.listDate <= date &&
        (!stock.delistDate || date < stock.delistDate)
      );
    },
  };
}

@Injectable()
export class StockIdentityService {
  constructor(
    private readonly db: DataSource,
    private readonly tushare: TushareService,
  ) {}

  async refresh(manager: EntityManager, listed: StockEntity[], force = false) {
    const asOf = shanghaiDate();
    const previous = await manager.findOneBy(StockHistoryEntity, {
      snapshotKey: 'identity',
    });
    if (!force && previous?.asOf === asOf) return;
    const archived: any[] = [];
    for (const status of ['D', 'P']) {
      const response = await this.tushare.getStockBasic(status);
      archived.push(
        ...readIdentityRows(
          response,
          ['ts_code', 'name', 'list_date', 'delist_date'],
          true,
        ),
      );
    }
    const response = await this.tushare.queryData(
      'namechange',
      {},
      'ts_code,name,start_date,end_date',
      1000,
    );
    const names: HistoricalName[] = readIdentityRows(response, [
      'ts_code',
      'name',
      'start_date',
      'end_date',
    ])
      .filter((row: Record<string, any>) => stockCode.test(row.ts_code))
      .map((row: Record<string, any>) => {
        if (!row.name || !row.start_date) throw new Error('股票历史名称无效');
        return {
          tsCode: row.ts_code,
          name: row.name,
          startDate: sourceDate(row.start_date),
          endDate: row.end_date ? sourceDate(row.end_date) : null,
        };
      });
    const stocks = [
      ...listed.map((row) => ({
        tsCode: row.tsCode,
        name: row.name,
        listDate: row.listDate,
        delistDate: row.delistDate || null,
      })),
      ...archived
        .filter((row) => stockCode.test(row.ts_code))
        .map((row) => ({
          tsCode: row.ts_code,
          name: row.name,
          listDate: sourceDate(row.list_date),
          delistDate: row.delist_date ? sourceDate(row.delist_date) : null,
        })),
    ];
    if (new Set(stocks.map((row) => row.tsCode)).size !== stocks.length)
      throw new Error('股票历史列表含重复代码');
    if (
      previous &&
      (names.length < previous.data.names.length * 0.8 ||
        stocks.length < previous.data.stocks.length * 0.8)
    )
      throw new Error('股票历史快照数量异常，保留原数据');
    await manager.upsert(
      StockHistoryEntity,
      { snapshotKey: 'identity', asOf, data: { stocks, names } },
      ['snapshotKey'],
    );
  }

  async load(dates: string[], codes?: string[], manager = this.db.manager) {
    const [snapshot, mapping] = await Promise.all([
      manager.findOneBy(StockHistoryEntity, { snapshotKey: 'identity' }),
      manager.find(BseMappingEntity),
    ]);
    if (!snapshot || dates.some((date) => date > snapshot.asOf))
      throw new ConflictException('股票历史信息尚未同步完整，请稍后重试');
    const identity = identityIndex(snapshot, mapping);
    const requested =
      codes && new Set(codes.map((code) => identity.canonical(code)));
    const extras: HistoricalName[] = [];
    // Some namechange histories end in 2006 without the subsequent name.
    // Fill only uncovered code/date pairs from a historical daily catalog,
    // caching names (not prices) so screening never assumes today's ST status.
    for (const date of [...new Set(dates)]) {
      const missing = new Set(
        snapshot.data.stocks
          .map((row) => identity.canonical(row.tsCode))
          .filter(
            (code) =>
              (!requested || requested.has(code)) &&
              identity.listed(code, date) &&
              !identity.name(code, date),
          ),
      );
      if (!missing.size) continue;
      const snapshotKey = `day:${date}`;
      const cached = await manager.findOneBy(StockHistoryEntity, {
        snapshotKey,
      });
      // A successful catalog may not contain an inactive code. Keep its name
      // unknown, but avoid repeating the same lookup on every chart request.
      // Retry after one day, or immediately after the registry changes.
      const checkedAge = cached?.data.checkedAt
        ? Date.now() - Date.parse(cached.data.checkedAt)
        : NaN;
      const checked =
        cached?.asOf === snapshot.asOf &&
        checkedAge >= 0 &&
        checkedAge < 86400000
          ? cached.data.checkedCodes || []
          : [];
      const covered = new Set([
        ...(cached?.data.names.map((row) => row.tsCode) || []),
        ...checked,
      ]);
      let names = cached?.data.names || [];
      if ([...missing].some((code) => !covered.has(code))) {
        const response = await this.tushare.queryData(
          'bak_basic',
          { trade_date: date.replace(/-/g, '') },
          'ts_code,name,trade_date',
        );
        const rows = readIdentityRows(response, [
          'ts_code',
          'name',
          'trade_date',
        ]);
        if (
          rows.some(
            (row: Record<string, any>) =>
              sourceDate(row.trade_date) !== date || !row.name,
          )
        )
          throw new ConflictException('历史股票名称补数异常');
        const supplements = rows
          .filter((row: Record<string, any>) =>
            missing.has(identity.canonical(row.ts_code)),
          )
          .map((row: Record<string, any>) => ({
            tsCode: identity.canonical(row.ts_code),
            name: row.name,
            startDate: date,
            endDate: date,
          }));
        names = [
          ...names.filter((row) => !missing.has(row.tsCode)),
          ...supplements,
        ];
        // We only need the persisted supplement. A duplicate no-op upsert can
        // return insertId=0, so do not ask TypeORM to hydrate a generated id.
        await manager
          .createQueryBuilder()
          .insert()
          .into(StockHistoryEntity)
          .values({
            snapshotKey,
            asOf: snapshot.asOf,
            data: {
              stocks: [],
              names,
              checkedCodes: [...new Set([...checked, ...missing])],
              checkedAt: new Date().toISOString(),
            },
          })
          .orUpdate(['as_of', 'data'], ['snapshot_key'])
          .updateEntity(false)
          .execute();
      }
      extras.push(...names);
    }
    if (extras.length)
      return identityIndex(
        Object.assign(new StockHistoryEntity(), snapshot, {
          data: {
            stocks: snapshot.data.stocks,
            names: [...snapshot.data.names, ...extras],
          },
        }),
        mapping,
      );
    return identity;
  }

  async assertReady(dates: string[]) {
    if (dates.length < 3 || dates.some((date) => !date))
      throw new ConflictException('策略所需交易日不足');
    const [runs, policies, counts] = await Promise.all([
      this.db.manager.find(SyncRunEntity, {
        where: { task: 'daily', tradeDate: In(dates) },
      }),
      this.db.manager.find(SyncDayPolicyEntity, {
        where: { tradeDate: In(dates) },
      }),
      this.db.query(
        "SELECT DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,COUNT(*) count FROM t_source_daily WHERE trade_date IN (?) GROUP BY trade_date",
        [dates],
      ),
    ]);
    const sizes = new Map(
      counts.map((row: any) => [
        String(row.tradeDate).slice(0, 10),
        Number(row.count),
      ]),
    );
    const missing = dates.filter((date) => {
      const run = runs.find((row) => row.tradeDate === date);
      return (
        !run ||
        run.status !== 'success' ||
        !run.dailyCount ||
        sizes.get(date) !== run.dailyCount ||
        policies.some((row) => row.tradeDate === date)
      );
    });
    if (missing.length)
      throw new ConflictException(
        `行情数据未同步完整：${missing.sort().join('、')}`,
      );
  }

  async decorate(rows: DailyEntity[], manager: EntityManager) {
    const identity = await this.load(
      [...new Set(rows.map((row) => row.tradeDate))],
      [...new Set(rows.map((row) => row.tsCode))],
      manager,
    );
    return rows.map(
      (row) =>
        ({
          ...row,
          name: identity.name(row.tsCode, row.tradeDate),
        }) as DailyEntity,
    );
  }
}
