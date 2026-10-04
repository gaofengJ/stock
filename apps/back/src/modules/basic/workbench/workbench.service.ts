/* eslint-disable no-restricted-syntax, no-await-in-loop, no-nested-ternary */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, LessThanOrEqual } from 'typeorm';
import * as dayjs from 'dayjs';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { StockEntity } from '@/modules/source/stock/stock.entity';
import { StockHistoryEntity } from '@/modules/source/stock/stock-history.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { ActiveFundsEntity } from '@/modules/source/active-funds/active-funds.entity';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { SectorService } from '@/modules/analysis/market/sector.service';
import { shanghaiDate } from '@/modules/daily-task/sync.utils';
import { BasicSnapshotService, SourceSnapshot } from './snapshot.service';
import { WorkbenchQuery } from './workbench.dto';

export const isoDate = (value: unknown) =>
  String(value || '')
    .slice(0, 10)
    .replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const compact = (date: string) => date.replace(/-/g, '');
export function latestDisclosed(rows: Record<string, any>[], date: string) {
  return (
    rows
      .filter(
        (r) =>
          isoDate(r.f_ann_date || r.ann_date) &&
          isoDate(r.f_ann_date || r.ann_date) <= date,
      )
      .sort(
        (a, b) =>
          String(b.end_date).localeCompare(String(a.end_date)) ||
          String(b.f_ann_date || b.ann_date).localeCompare(
            String(a.f_ann_date || a.ann_date),
          ) ||
          Number(b.update_flag || 0) - Number(a.update_flag || 0),
      )[0] || null
  );
}
export const sourceStatus = (snapshots: SourceSnapshot[]) =>
  snapshots.map(({ rows, ...status }) => ({ ...status, count: rows.length }));
export const normalizeOrg = (value: unknown) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '');

/** One calendar event per stock/day; a revised holder announcement replaces the older version. */
export function groupUnlockEvents(items: Record<string, any>[]) {
  const groups = new Map<string, Record<string, any>[]>();
  const other = items.filter((r) => r.source !== 'share_float');
  items
    .filter((r) => r.source === 'share_float')
    .forEach((r) => {
      const key = `${r.tsCode}:${r.eventDate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    });
  groups.forEach((rows) => {
    const latest = new Map<string, Record<string, any>>();
    rows.forEach((r) => {
      const key = JSON.stringify([r.holder_name, r.share_type]);
      const old = latest.get(key);
      if (!old || r.announcedAt > old.announcedAt) latest.set(key, r);
    });
    const records = [...latest.values()];
    const known = records.filter(
      (r) => r.float_share != null && Number.isFinite(Number(r.float_share)),
    );
    const shares = known.reduce((sum, r) => sum + Number(r.float_share), 0);
    const announcedAt = records
      .map((r) => r.announcedAt)
      .sort()
      .reverse()[0];
    other.push({
      tsCode: rows[0].tsCode,
      name: rows[0].name,
      type: '解禁',
      source: 'share_float',
      eventDate: rows[0].eventDate,
      reportDate: '',
      announcedAt,
      recordCount: records.length,
      detail: `解禁${
        known.length ? `${(shares / 10000).toFixed(2)}万股` : '数量待核实'
      }；${records.length}条股东记录${
        known.length !== records.length ? '（部分数量缺失）' : ''
      }；${[...new Set(records.map((r) => r.share_type).filter(Boolean))].join(
        '、',
      )}`,
    });
  });
  return other;
}

@Injectable()
export class WorkbenchService {
  constructor(
    private db: DataSource,
    private cache: BasicSnapshotService,
    private sectors: SectorService,
  ) {}

  async profile(dto: WorkbenchQuery) {
    if (!dto.code) throw new BadRequestException('请选择股票');
    const mapping = await this.db.manager.find(BseMappingEntity);
    const code =
      mapping.find((r) => r.oldCode === dto.code)?.newCode || dto.code;
    const aliases = [
      code,
      ...mapping.filter((r) => r.newCode === code).map((r) => r.oldCode),
    ];
    const date = dto.date || shanghaiDate();
    const [stock, history] = await Promise.all([
      this.db.manager.findOneBy(StockEntity, { tsCode: code }),
      this.db.manager.findOneBy(StockHistoryEntity, {
        snapshotKey: 'identity',
      }),
    ]);
    const historic = history?.data.stocks.find((r) =>
      aliases.includes(r.tsCode),
    );
    if (!stock && !historic) throw new BadRequestException('未找到该股票');
    const exchange = code.endsWith('.SH')
      ? 'SSE'
      : code.endsWith('.SZ')
      ? 'SZSE'
      : 'BSE';
    const [company, financial, cashflow] = await Promise.all([
      this.cache.read(
        'stock_company',
        { exchange },
        'ts_code,com_name,chairman,manager,reg_capital,setup_date,province,city,introduction,website,main_business,business_scope',
      ),
      this.cache.read(
        'fina_indicator',
        { ts_code: code },
        'ts_code,ann_date,end_date,or_yoy,netprofit_yoy,profit_dedt,debt_to_assets,update_flag',
      ),
      this.cache.read(
        'cashflow',
        { ts_code: code },
        'ts_code,ann_date,f_ann_date,end_date,n_cashflow_act,report_type,update_flag',
      ),
    ]);
    const financialRow = latestDisclosed(financial.rows, date);
    const cashRow = latestDisclosed(
      cashflow.rows.filter(
        (r) =>
          String(r.report_type) === '1' &&
          (!financialRow || r.end_date === financialRow.end_date),
      ),
      date,
    );
    const daily = await this.db.manager
      .getRepository(DailyEntity)
      .createQueryBuilder('d')
      .where('d.tsCode IN (:...aliases) AND d.tradeDate <= :date', {
        aliases,
        date,
      })
      .orderBy('d.tradeDate', 'DESC')
      .getOne();
    const base = stock || { ...historic?.profile, ...historic, tsCode: code };
    const [decorated] = await this.sectors.decorate([base], date);
    return {
      code,
      date,
      stock: {
        ...decorated,
        open: daily?.open,
        close: daily?.close,
        high: daily?.high,
        low: daily?.low,
        amount: daily?.amount,
      },
      quoteDate: daily?.tradeDate || null,
      aliases,
      profileAsOf: history?.asOf || null,
      company: company.rows.find((r) => aliases.includes(r.ts_code)) || null,
      names: (history?.data.names || [])
        .filter((r) => aliases.includes(r.tsCode))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
      financial: financialRow,
      cashflow: cashRow,
      sources: sourceStatus([company, financial, cashflow]),
    };
  }

  async risk(dto: WorkbenchQuery) {
    const date = dto.date || shanghaiDate();
    const tradeDate = compact(date);
    const definitions = [
      ['stock_st', { trade_date: tradeDate }, 'ST'],
      ['st', {}, 'ST原因'],
      ['suspend_d', { trade_date: tradeDate }, '停复牌'],
      ['stk_shock', { trade_date: tradeDate }, '异常波动'],
      ['stk_high_shock', { trade_date: tradeDate }, '严重异常波动'],
      [
        'stk_alert',
        {
          start_date: compact(
            dayjs(date).subtract(90, 'day').format('YYYY-MM-DD'),
          ),
          end_date: tradeDate,
        },
        '交易所提示',
      ],
    ] as const;
    const snapshots = await Promise.all(
      definitions.map(([api, params]) => this.cache.read(api, params)),
    );
    const reasons = snapshots[1].rows.filter(
      (r) => isoDate(r.pub_date) <= date && isoDate(r.imp_date) <= date,
    );
    let items: Record<string, any>[] = snapshots.flatMap((snapshot, index) =>
      index === 1
        ? []
        : snapshot.rows
            .filter((r) => /^\d{6}\.(SH|SZ|BJ)$/.test(r.ts_code))
            .filter(
              (r) =>
                index !== 5 ||
                (isoDate(r.start_date) <= date &&
                  (!r.end_date || isoDate(r.end_date) >= date)),
            )
            .map((r) => {
              const reason = reasons
                .filter((v) => v.ts_code === r.ts_code)
                .sort((a, b) =>
                  String(b.imp_date).localeCompare(String(a.imp_date)),
                )[0];
              return {
                ...r,
                tsCode: r.ts_code,
                date,
                type:
                  index === 2
                    ? r.suspend_type === 'R'
                      ? '复牌'
                      : '停牌'
                    : definitions[index][2],
                detail:
                  index === 0
                    ? reason?.st_explain || r.type_name || '原因暂缺'
                    : r.reason || r.suspend_timing || r.type || '—',
                eventDate: isoDate(r.start_date || r.trade_date || date),
                endDate: isoDate(r.end_date),
                source: snapshot.source,
              };
            }),
    );
    const stocks = await this.db.manager.find(StockEntity);
    const history = await this.db.manager.findOneBy(StockHistoryEntity, {
      snapshotKey: 'identity',
    });
    const stockMap = new Map(stocks.map((r) => [r.tsCode, r.name]));
    history?.data.stocks.forEach((r) => {
      if (!stockMap.has(r.tsCode)) stockMap.set(r.tsCode, r.name);
    });
    items = items
      .filter((r) => stockMap.has(r.tsCode))
      .map((r) => ({ ...r, name: r.name || stockMap.get(r.tsCode) }));
    if (dto.code) items = items.filter((r) => r.tsCode === dto.code);
    if (dto.keyword)
      items = items.filter(
        (r) =>
          r.tsCode.includes(dto.keyword || '') ||
          String(r.name || '').includes(dto.keyword || ''),
      );
    if (dto.sector) {
      const codes = await this.sectors.codes(dto.sector, date);
      items = items.filter((r) => codes.has(r.tsCode));
    }
    return {
      date,
      items: await this.sectors.decorate(items, date),
      sources: sourceStatus(snapshots),
      note: '异动按公告日；停复牌按当日记录；重点提示截止日仅供参考。来源未就绪不代表无风险。',
    };
  }

  async events(dto: WorkbenchQuery) {
    const date = dto.date || shanghaiDate();
    const end = dayjs(date)
      .add(Number(dto.days || 7) - 1, 'day')
      .format('YYYY-MM-DD');
    const startDate = compact(date);
    const endDate = compact(end);
    // Disclosure dates are looked up by report period; pre_date is not an API range filter.
    const periods = new Set<string>();
    for (const year of [dayjs(date).year() - 1, dayjs(date).year()])
      for (const suffix of ['0331', '0630', '0930', '1231']) {
        const period = String(year) + suffix;
        if (period <= endDate) periods.add(period);
      }
    const requests: [string, Record<string, unknown>, string][] = [
      ...[...periods].map(
        (period): [string, Record<string, unknown>, string] => [
          'disclosure_date',
          { end_date: period },
          '财报披露',
        ],
      ),
      ['express', { start_date: startDate, end_date: endDate }, '业绩快报'],
    ];
    // Dividend API has no date-range selector; query ex_date once per day and share snapshots across users.
    for (
      let d = dayjs(date);
      d.format('YYYY-MM-DD') <= end;
      d = d.add(1, 'day')
    ) {
      // Unlocks can exceed 100,000 holder rows in a month; keep source snapshots bounded by day.
      requests.push([
        'share_float',
        { start_date: d.format('YYYYMMDD'), end_date: d.format('YYYYMMDD') },
        '解禁',
      ]);
      requests.push([
        'dividend',
        { ex_date: d.format('YYYYMMDD') },
        '除权除息',
      ]);
      if (d.format('YYYY-MM-DD') <= shanghaiDate())
        requests.push([
          'forecast',
          { ann_date: d.format('YYYYMMDD') },
          '业绩预告',
        ]);
    }
    const snapshots = await Promise.all(
      requests.map(([api, params]) => this.cache.read(api, params)),
    );
    let items: Record<string, any>[] = snapshots
      .flatMap((snapshot, i) =>
        snapshot.rows.map((r) => ({
          ...r,
          tsCode: r.ts_code,
          type: requests[i][2],
          source: snapshot.source,
          eventDate: isoDate(
            r.float_date ||
              r.actual_date ||
              r.pre_date ||
              r.ex_date ||
              r.ann_date,
          ),
          reportDate: isoDate(r.end_date),
          announcedAt: isoDate(r.ann_date || r.imp_ann_date),
          provisional: snapshot.source === 'disclosure_date' && !r.actual_date,
          detail:
            snapshot.source === 'share_float'
              ? `解禁${(Number(r.float_share) / 10000).toFixed(2)}万股；${
                  r.float_ratio == null ? '占比未知' : `${r.float_ratio}%`
                }；${r.share_type || ''}`
              : snapshot.source === 'dividend'
              ? `每股税前派息${r.cash_div_tax ?? '—'}元；每股送转${
                  r.stk_div ?? '—'
                }股`
              : r.summary ||
                r.perf_summary ||
                (r.end_date ? `报告期 ${isoDate(r.end_date)}` : '—'),
        })),
      )
      .filter((r) => r.eventDate >= date && r.eventDate <= end);
    if (dto.code) items = items.filter((r) => r.tsCode === dto.code);
    if (dto.sector) {
      const codes = await this.sectors.codes(dto.sector, date);
      items = items.filter((r) => codes.has(r.tsCode));
    }
    const stockNames = new Map(
      (await this.db.manager.find(StockEntity)).map((r) => [r.tsCode, r.name]),
    );
    items = items.map((r) => ({
      ...r,
      name: r.name || stockNames.get(r.tsCode) || r.tsCode,
    }));
    if (dto.keyword)
      items = items.filter(
        (r) =>
          r.tsCode.includes(dto.keyword || '') ||
          r.name.includes(dto.keyword || ''),
      );
    const unique = [
      ...new Map(
        items.map((r) => [
          JSON.stringify([
            r.tsCode,
            r.type,
            r.eventDate,
            r.reportDate,
            r.holder_name,
            r.announcedAt,
            r.detail,
          ]),
          r,
        ]),
      ).values(),
    ];
    const next = await this.db.manager
      .getRepository(TradeCalEntity)
      .createQueryBuilder('c')
      .where('c.calDate > :date AND c.isOpen=1', { date })
      .orderBy('c.calDate', 'ASC')
      .getOne();
    return {
      date,
      end,
      nextTradeDate: next?.calDate || null,
      items: groupUnlockEvents(unique).sort(
        (a, b) =>
          a.eventDate.localeCompare(b.eventDate) ||
          a.tsCode.localeCompare(b.tsCode),
      ),
      sources: sourceStatus(snapshots),
    };
  }

  async seat(dto: WorkbenchQuery) {
    if (!dto.org?.trim()) throw new BadRequestException('请选择营业部');
    const date = dto.date || shanghaiDate();
    const dates = await this.db.manager.find(TradeCalEntity, {
      where: { calDate: LessThanOrEqual(date), isOpen: 1 },
      order: { calDate: 'DESC' },
      take: Number(dto.days || 7),
    });
    const snapshots = await Promise.all(
      dates.map((d) =>
        this.cache.read('top_inst', { trade_date: compact(d.calDate) }),
      ),
    );
    const stockNames = new Map(
      (await this.db.manager.find(StockEntity)).map((r) => [r.tsCode, r.name]),
    );
    const items = snapshots.flatMap((s, i) =>
      s.rows
        .filter((r) => normalizeOrg(r.exalter) === normalizeOrg(dto.org))
        .map((r) => ({
          ...r,
          tsCode: r.ts_code,
          name: stockNames.get(r.ts_code) || r.ts_code,
          date: dates[i].calDate,
        })),
    );
    const funds = (await this.db.manager.find(ActiveFundsEntity)).filter((r) =>
      (JSON.parse(r.orgs || '[]') as string[]).some(
        (org) => normalizeOrg(org) === normalizeOrg(dto.org),
      ),
    );
    return {
      org: dto.org,
      date,
      dates: dates.map((d) => d.calDate),
      items,
      funds,
      lastActivity:
        items
          .map((r) => r.date)
          .sort()
          .reverse()[0] || null,
      sources: sourceStatus(snapshots),
      note: '关联来自公开游资名录，仅作线索；龙虎榜可能含不同上榜原因及买卖侧的重复席位，不跨榜累计。',
    };
  }

  @Cron('0 10 22 * * *', { timeZone: 'Asia/Shanghai' })
  async warm() {
    if (
      process.env.SCHEDULE_ENABLED === 'false' ||
      process.env.NODE_ENV !== 'production'
    )
      return;
    const latest = await this.db.manager.findOne(TradeCalEntity, {
      where: { calDate: LessThanOrEqual(shanghaiDate()), isOpen: 1 },
      order: { calDate: 'DESC' },
    });
    await Promise.allSettled([
      this.risk({ date: latest?.calDate || shanghaiDate() }),
      this.events({ date: shanghaiDate(), days: '30' }),
    ]);
  }
}
