import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { TrendService } from '@/modules/strategy/trend.service';
import { TREND_KEYS } from '@/modules/strategy/trend-rules';
import { DataSource, In, LessThanOrEqual } from 'typeorm';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { DailyService } from '@/modules/source/daily/daily.service';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { normalizeDate } from '@/modules/daily-task/sync.utils';
import { AsyncTtlCache } from '../async-ttl-cache';
import {
  BseMappingEntity,
  MarketBreadthEntity,
  MarketDailyEntity,
} from './market.entity';
import { inScope } from './market.constants';
import { ResearchQueryDto as MarketQueryDto } from './market.dto';
import { SectorService } from './sector.service';
import {
  feedbackGroups,
  STRATEGY_LABELS,
  trajectoryCell,
} from './market-research.utils';

@Injectable()
export class MarketResearchService {
  private cache = new AsyncTtlCache(30000);

  constructor(
    private db: DataSource,
    private daily: DailyService,
    private sectors: SectorService,
    @Optional() private trends?: TrendService,
  ) {}

  private async calendar(q: MarketQueryDto, take: number) {
    if (!q.date) throw new BadRequestException('请选择交易日');
    normalizeDate(q.date);
    const rows = await this.db.manager.find(TradeCalEntity, {
      where: { isOpen: 1, calDate: LessThanOrEqual(q.date) },
      order: { calDate: 'DESC' },
      take,
    });
    if (rows[0]?.calDate !== q.date)
      throw new BadRequestException('请选择交易日');
    return rows;
  }

  private async inputs(dates: string[], extraCodes: string[] = []) {
    const [limits, mapping, runs] = await Promise.all([
      this.db.manager.find(LimitEntity, {
        where: { tradeDate: In(dates) },
        select: ['tradeDate', 'tsCode', 'name', 'limit', 'limitTimes'],
      }),
      this.db.manager.find(BseMappingEntity),
      this.db.manager.find(SyncRunEntity, {
        where: { tradeDate: In(dates), task: 'market', status: 'success' },
      }),
    ]);
    const aliases = new Map(mapping.map((r) => [r.oldCode, r.newCode]));
    const canonical = (code: string) => aliases.get(code) || code;
    const codes = new Set([...limits.map((r) => r.tsCode), ...extraCodes]);
    mapping.forEach((r) => {
      if (codes.has(r.oldCode) || codes.has(r.newCode)) {
        codes.add(r.oldCode);
        codes.add(r.newCode);
      }
    });
    const daily = codes.size
      ? await this.db.manager.find(DailyEntity, {
          where: { tradeDate: In(dates), tsCode: In([...codes]) },
          select: [
            'tradeDate',
            'tsCode',
            'name',
            'pctChg',
            'amount',
            'open',
            'preClose',
            'close',
            'high',
            'low',
          ],
        })
      : [];
    return {
      limits,
      daily,
      canonical,
      ready: new Set(runs.map((r) => r.tradeDate)),
    };
  }

  async feedback(q: MarketQueryDto) {
    const calendar = await this.calendar(q, 3);
    const dates = calendar.map((r) => r.calDate);
    const input = await this.inputs(dates);
    const ready =
      dates.length >= 2 && dates.slice(0, 2).every((d) => input.ready.has(d));
    const groups = ready
      ? feedbackGroups(
          q.date!,
          dates[1],
          dates[2] || null,
          input.daily,
          input.limits,
          q.scope,
          input.canonical,
        )
      : [];
    // Yesterday's failed-chain group needs an additional published trading day.
    const failedReady = !!dates[2] && input.ready.has(dates[2]);
    return {
      date: q.date,
      previousDate: dates[1] || null,
      ready,
      groups: groups.map((g) => ({
        ...g,
        ready: g.key !== 'failed' || failedReady,
        members: g.members,
      })),
    };
  }

  async signals(q: MarketQueryDto) {
    const count = q.trajectoryDays || 1;
    const calendar = await this.calendar(q, count + 3);
    const dates = calendar
      .slice(0, count)
      .map((r) => r.calDate)
      .reverse();
    const [runs, mapping] = await Promise.all([
      this.db.manager.find(SyncRunEntity, {
        where: {
          tradeDate: In(calendar.map((r) => r.calDate)),
          task: 'daily',
          status: 'success',
        },
        select: ['tradeDate', 'updatedAt'],
      }),
      this.db.manager.find(BseMappingEntity),
    ]);
    const aliases = new Map(mapping.map((r) => [r.oldCode, r.newCode]));
    const canonical = (code: string) => aliases.get(code) || code;
    const ready = new Set(runs.map((r) => r.tradeDate));
    const key = JSON.stringify([
      calendar.map((r) => r.calDate),
      runs.map((r) => [r.tradeDate, r.updatedAt]),
      q.code || '',
    ]);
    const readyDates = dates.filter(
      (d) =>
        ready.has(d) &&
        calendar.filter((r) => r.calDate <= d).slice(0, 4).length === 4 &&
        calendar
          .filter((r) => r.calDate <= d)
          .slice(0, 4)
          .every((r) => ready.has(r.calDate)),
    );
    const legacy = readyDates.length
      ? this.cache.getOrCreate(key, async () => {
          // Limit history queries to the trajectory universe. Daily all-market
          // counts use necessary last-day conditions shared by every strategy.
          let codes: string[];
          if (q.code) codes = [q.code];
          else if (count > 1) {
            const events = await this.db.manager.find(LimitEntity, {
              where: { tradeDate: In(dates), limit: In(['U', 'Z']) },
              select: ['tsCode'],
            });
            codes = [...new Set(events.map((r) => r.tsCode))];
          } else {
            const eligible: { tsCode: string }[] = await this.db.query(
              'SELECT ts_code tsCode FROM t_source_daily WHERE trade_date=? AND amount>50000 AND close*2>=high+low',
              [q.date],
            );
            codes = eligible.map((r) => r.tsCode);
          }
          mapping.forEach((r) => {
            if (codes.includes(r.oldCode) || codes.includes(r.newCode))
              codes.push(r.oldCode, r.newCode);
          });
          return this.daily.strategyHistory(
            calendar.map((r) => r.calDate).reverse(),
            dates,
            [...new Set(codes)],
          );
        })
      : Promise.resolve([]);
    const trendService = this.trends;
    const [results, trend] = await Promise.all([
      legacy,
      trendService
        ? (async () => {
            let codes: string[] | undefined = q.code ? [q.code] : undefined;
            if (!codes && count > 1) {
              const events = await this.db.manager.find(LimitEntity, {
                where: { tradeDate: In(dates), limit: In(['U', 'Z']) },
                select: ['tsCode'],
              });
              codes = [...new Set(events.map((r) => r.tsCode))];
            }
            return trendService.history(dates, TREND_KEYS, {}, codes);
          })()
        : Promise.resolve(null),
    ]);
    const items = results.flatMap((result) => {
      if (!result.complete || !readyDates.includes(result.date)) return [];
      const merged = new Map<string, string[]>();
      result.hits.forEach((strategies, code) => {
        const tsCode = canonical(code);
        if (!inScope(tsCode, q.scope)) return;
        merged.set(tsCode, [
          ...new Set([...(merged.get(tsCode) || []), ...strategies]),
        ]);
      });
      return [...merged].map(([tsCode, strategies]) => ({
        date: result.date,
        tsCode,
        strategies,
      }));
    });
    const readyByStrategy = Object.fromEntries(
      Object.keys(STRATEGY_LABELS).map((strategy) => [
        strategy,
        TREND_KEYS.includes(strategy as any) ? ([] as string[]) : readyDates,
      ]),
    );
    if (trend) {
      Object.assign(readyByStrategy, trend.readyByStrategy);
      trend.items.forEach(({ date, key: strategy, rows }) =>
        rows.forEach((row) => {
          if (!inScope(row.tsCode, q.scope)) return;
          const item = items.find(
            (r) => r.date === date && r.tsCode === row.tsCode,
          );
          if (item) item.strategies.push(strategy);
          else items.push({ date, tsCode: row.tsCode, strategies: [strategy] });
        }),
      );
    }
    return {
      dates,
      readyDates,
      readyByStrategy,
      strategies: Object.entries(STRATEGY_LABELS).map(([strategy, label]) => ({
        key: strategy,
        label,
      })),
      items,
    };
  }

  async sectorSignals(q: MarketQueryDto) {
    const signals = await this.signals({
      ...q,
      scope: 'all',
      trajectoryDays: 1,
    });
    const counts = Object.values(signals.readyByStrategy).some((dates) =>
      dates.includes(q.date!),
    )
      ? await this.sectors.signalCounts(
          q.date!,
          new Map(signals.items.map((r) => [r.tsCode, r.strategies])),
        )
      : [];
    return { ...signals, date: q.date, counts };
  }

  async trajectories(q: MarketQueryDto) {
    const count = q.trajectoryDays || 10;
    const calendar = await this.calendar(q, count + 1);
    const dates = calendar
      .slice(0, count)
      .map((r) => r.calDate)
      .reverse();
    const input = await this.inputs(
      calendar.map((r) => r.calDate),
      q.code ? [q.code] : [],
    );
    const members = q.sector
      ? await this.sectors.codes(q.sector, q.date)
      : null;
    const names = new Map<string, string>();
    input.limits
      .filter(
        (r) => dates.includes(r.tradeDate) && ['U', 'Z'].includes(r.limit),
      )
      .forEach((r) => names.set(input.canonical(r.tsCode), r.name));
    if (q.code)
      names.set(
        input.canonical(q.code),
        input.daily.find(
          (r) => input.canonical(r.tsCode) === input.canonical(q.code!),
        )?.name || q.code,
      );
    const prices = new Map(
      input.daily.map((r) => [
        `${r.tradeDate}:${input.canonical(r.tsCode)}`,
        r,
      ]),
    );
    const byKey = new Map<string, typeof input.limits>();
    input.limits.forEach((r) => {
      const key = `${r.tradeDate}:${input.canonical(r.tsCode)}`;
      byKey.set(key, [...(byKey.get(key) || []), r]);
    });
    const items = [...names]
      .filter(
        ([code, name]) =>
          inScope(code, q.scope) &&
          (!q.code || code === input.canonical(q.code)) &&
          (!members || members.has(code)) &&
          (!q.keyword || `${code} ${name}`.includes(q.keyword)),
      )
      .map(([tsCode, name]) => ({
        tsCode,
        name,
        cells: dates.map((date) => {
          const prior = calendar.find((r) => r.calDate === date)?.preTradeDate;
          return trajectoryCell(
            date,
            input.ready.has(date),
            prices.get(`${date}:${tsCode}`),
            byKey.get(`${date}:${tsCode}`),
            input.ready.has(prior!)
              ? byKey.get(`${prior}:${tsCode}`)?.find((r) => r.limit === 'U')
              : undefined,
          );
        }),
      }))
      .sort(
        (a, b) =>
          (b.cells[b.cells.length - 1]?.height || 0) -
            (a.cells[a.cells.length - 1]?.height || 0) ||
          a.tsCode.localeCompare(b.tsCode),
      );
    return {
      date: q.date,
      dates,
      items: await this.sectors.decorate(items, q.date),
      ready: input.ready.has(q.date!),
    };
  }

  async environment(q: MarketQueryDto) {
    await this.calendar(q, 1);
    const [market, breadth, run, breadthRun] = await Promise.all([
      this.db.manager.findOneBy(MarketDailyEntity, {
        tradeDate: q.date,
        scope: 'all',
      }),
      this.db.manager.findOneBy(MarketBreadthEntity, {
        tradeDate: q.date,
        scope: 'all',
      }),
      this.db.manager.findOneBy(SyncRunEntity, {
        tradeDate: q.date,
        task: 'market',
        status: 'success',
      }),
      this.db.manager.findOneBy(SyncRunEntity, {
        tradeDate: q.date,
        task: 'market-breadth',
        status: 'success',
      }),
    ]);
    return {
      date: q.date,
      market: run ? market?.data || null : null,
      breadth: run && breadthRun ? breadth?.data || null : null,
    };
  }
}
