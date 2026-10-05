import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { DailyEntity } from '../source/daily/daily.entity';
import { StockHistoryEntity } from '../source/stock/stock-history.entity';
import { StockIdentityService } from '../source/stock/stock-identity.service';
import { AsyncTtlCache } from '../analysis/async-ttl-cache';
import { BseMappingEntity } from '../analysis/market/market.entity';

/** Narrow projections for interactive screening; the existing rule evaluators remain authoritative. */
@Injectable()
export class StrategyReadService {
  private readonly memberships = new AsyncTtlCache(30000);

  constructor(
    private db: DataSource,
    private identity: StockIdentityService,
  ) {}

  async decorate(rows: DailyEntity[], date: string) {
    if (!rows.length) return [];
    const membership: {
      code: string;
      name: string;
      type: string;
      asOf: string;
      hits: number[];
    }[] = await this.memberships.getOrCreate(
      JSON.stringify([date, rows.map((row) => row.tsCode)]),
      () =>
        this.db.query(
          `SELECT s.ts_code code,c.name,c.type,DATE_FORMAT(s.as_of,'%Y-%m-%d') asOf,JSON_ARRAY(${rows
            .map(() => "JSON_CONTAINS(s.members,JSON_OBJECT('code',?))")
            .join(
              ',',
            )}) hits FROM t_source_ths_members s JOIN (SELECT ts_code,COALESCE(MAX(CASE WHEN as_of<=? THEN as_of ELSE NULL END),MIN(as_of)) as_of FROM t_source_ths_members GROUP BY ts_code) chosen ON s.ts_code=chosen.ts_code AND s.as_of=chosen.as_of JOIN t_source_ths_sector c ON c.ts_code=s.ts_code AND c.active=1`,
          [...rows.map((row) => row.tsCode), date],
        ),
    );
    return rows.map((row, i) => {
      const links = membership
        .filter((s) => s.hits[i])
        .map((s) => ({
          code: s.code,
          name: s.name,
          type: s.type,
          asOf: s.asOf,
        }));
      const industries = links.filter((s) => s.type === 'I');
      return {
        ...row,
        industry: industries.map((s) => s.name).join('／'),
        industries,
        topics: links.filter((s) => s.type === 'N'),
      };
    });
  }

  async sequence(dates: string[], bullish: boolean, strategy: string) {
    await this.identity.assertReady(dates);
    const mapping = await this.db.manager.find(BseMappingEntity);
    const canonical = (code: string) =>
      mapping.find((r) => r.oldCode === code)?.newCode || code;
    // Only necessary signal-day conditions: retain all aliases and all history
    // for selected codes, including invalid days which the rule evaluator rejects.
    const selected: { code: string }[] = await this.db.query(
      `SELECT ts_code code FROM t_source_daily WHERE trade_date=? AND amount>50000 AND vol>0 AND close*2>=high+low${
        bullish ? ' AND close>open' : ''
      }`,
      [dates[0]],
    );
    const codes = new Set(selected.map((r) => canonical(r.code)));
    mapping.forEach((r) => {
      if (codes.has(r.newCode)) codes.add(r.oldCode);
    });
    if (!codes.size) return new Map<string, Record<string, DailyEntity>>();
    const rows: DailyEntity[] = await this.db.query(
      `SELECT ts_code tsCode,DATE_FORMAT(trade_date,'%Y-%m-%d') tradeDate,open,close,high,low,pre_close preClose,pct_chg pctChg,vol,amount,up_limit upLimit,turnover_rate_f turnoverRateF,volume_ratio volumeRatio,pe_ttm peTtm,total_mv totalMv,circ_mv circMv FROM t_source_daily WHERE trade_date IN (?) AND ts_code IN (?)`,
      [dates, [...codes]],
    );
    const raw = new Map<string, Record<string, DailyEntity>>();
    rows.forEach((row) => {
      const code = canonical(row.tsCode);
      const series = raw.get(code) || {};
      const previous = series[row.tradeDate];
      if (
        previous &&
        ['open', 'close', 'high', 'low', 'preClose'].some(
          (key) => Number((previous as any)[key]) !== Number((row as any)[key]),
        )
      )
        throw new ConflictException(
          `${row.tradeDate} 股票新旧代码行情冲突，请核查数据`,
        );
      series[row.tradeDate] = row;
      raw.set(code, series);
    });
    // A geometric superset only: keep missing turnover/name checks for the
    // authoritative evaluator after historical identity has been resolved.
    const possible = new Set(
      [...raw]
        .filter(([, series]) => {
          const days = dates.map((d) => series[d]);
          if (days.some((d) => !d)) return false;
          if (strategy === 'threeDaysHighVol')
            return days.every((d) => Number(d.close) > Number(d.open));
          const baseline = days[days.length - 1];
          const shape = days.slice(0, -1);
          if (!shape.every((d) => Number(d.low) > Number(baseline.high)))
            return false;
          if (strategy === 'continuousGap')
            return Number(days[0].low) > Number(days[1].high);
          if (strategy === 'shadowWrap')
            return Number(days[0].close) > Number(days[1].high);
          if (strategy === 'gapThreeHighTurnover')
            return (
              Number(shape[shape.length - 1].amount) > Number(baseline.amount)
            );
          return shape.every((d) => Number(d.close) > Number(d.open));
        })
        .map(([code]) => code),
    );
    if (!possible.size) return new Map<string, Record<string, DailyEntity>>();
    const wanted = [...possible];
    mapping.forEach((r) => {
      if (possible.has(r.newCode)) wanted.push(r.oldCode);
    });
    // Stock profiles contain extensive unrelated information. Project only the
    // fields identityIndex uses, while preserving the existing historical-name
    // supplement logic and date/alias checks through StockIdentityService.load.
    const manager = new Proxy(this.db.manager, {
      get: (target, property) => {
        if (property === 'findOneBy')
          return async (entity: unknown, where: any) => {
            if (
              entity !== StockHistoryEntity ||
              where.snapshotKey !== 'identity'
            )
              return target.findOneBy(entity as any, where);
            if (wanted.length > 40) {
              const [r] = await target.query(
                "SELECT DATE_FORMAT(as_of,'%Y-%m-%d') asOf,JSON_EXTRACT(data,'$.stocks[*].tsCode') codes,JSON_EXTRACT(data,'$.stocks[*].name') names,JSON_EXTRACT(data,'$.stocks[*].listDate') listed,JSON_EXTRACT(data,'$.stocks[*].delistDate') delisted,JSON_EXTRACT(data,'$.names') periods FROM t_source_stock_history WHERE snapshot_key='identity'",
              );
              return r
                ? Object.assign(new StockHistoryEntity(), {
                    snapshotKey: 'identity',
                    asOf: r.asOf,
                    data: {
                      stocks: r.codes.map((code: string, i: number) => ({
                        tsCode: code,
                        name: r.names[i],
                        listDate: r.listed[i],
                        delistDate: r.delisted[i],
                      })),
                      names: r.periods,
                    },
                  })
                : null;
            }
            const [index] = await target.query(
              `SELECT DATE_FORMAT(as_of,'%Y-%m-%d') asOf,CAST(updated_at AS CHAR) revision,JSON_ARRAY(${wanted
                .map(
                  () =>
                    "JSON_SEARCH(data,'all',?,NULL,'$.stocks[*].tsCode','$.names[*].tsCode')",
                )
                .join(
                  ',',
                )}) paths FROM t_source_stock_history WHERE snapshot_key='identity'`,
              wanted,
            );
            if (!index) return null;
            const paths: string[] = index.paths
              .flat()
              .filter(Boolean)
              .map((p: string) => p.replace(/\.tsCode$/, ''));
            const [projected] = paths.length
              ? await target.query(
                  `SELECT JSON_ARRAY(${paths
                    .map(() => 'JSON_EXTRACT(data,?)')
                    .join(
                      ',',
                    )}) items FROM t_source_stock_history WHERE snapshot_key='identity' AND as_of=? AND CAST(updated_at AS CHAR)=?`,
                  [...paths, index.asOf, index.revision],
                )
              : [{ items: [] }];
            if (!projected)
              throw new ConflictException('股票历史信息正在更新，请重试');
            return Object.assign(new StockHistoryEntity(), {
              snapshotKey: 'identity',
              asOf: index.asOf,
              data: {
                stocks: projected.items.filter((r: any) => 'listDate' in r),
                names: projected.items.filter((r: any) => 'startDate' in r),
              },
            });
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as EntityManager;
    const identity = await this.identity.load(dates, wanted, manager);
    const result = new Map<string, Record<string, DailyEntity>>();
    rows.forEach((row) => {
      const code = identity.canonical(row.tsCode);
      if (!possible.has(code)) return;
      const name = identity.name(code, row.tradeDate);
      if (
        identity.listed(code, row.tradeDate) &&
        !name &&
        Number(row.amount) > 50000 &&
        Number(row.vol) > 0
      )
        throw new ConflictException(
          `${row.tradeDate} 股票历史名称不完整，请补同步历史信息`,
        );
      const series = result.get(code) || {};
      const previous = series[row.tradeDate];
      if (
        previous &&
        ['open', 'close', 'high', 'low', 'preClose'].some(
          (key) => Number((previous as any)[key]) !== Number((row as any)[key]),
        )
      )
        throw new ConflictException(
          `${row.tradeDate} 股票新旧代码行情冲突，请核查数据`,
        );
      if (!previous || row.tsCode === code)
        series[row.tradeDate] = Object.assign(new DailyEntity(), row, {
          tsCode: code,
          name,
        });
      result.set(code, series);
    });
    return result;
  }
}
