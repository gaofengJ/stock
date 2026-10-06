/* eslint-disable no-restricted-syntax, no-await-in-loop, no-nested-ternary */
import { Injectable, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, LessThanOrEqual } from 'typeorm';
import * as dayjs from 'dayjs';
import { createHash } from 'crypto';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { StockEntity } from '@/modules/source/stock/stock.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { ActiveFundsEntity } from '@/modules/source/active-funds/active-funds.entity';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { SectorService } from '@/modules/analysis/market/sector.service';
import { AsyncTtlCache } from '@/modules/analysis/async-ttl-cache';
import { shanghaiDate } from '@/modules/daily-task/sync.utils';
import { BasicSnapshotService, SourceSnapshot } from './snapshot.service';
import { WorkbenchQuery } from './workbench.dto';
import { readProfileHistory } from './profile-reader';
import {
  latestReductionRecords,
  reductionState,
  terminalReduction,
} from './reduction-state';
import {
  RISK_CHECKLIST,
  announcementCategories,
  safeAnnouncementUrl,
  stockBoard,
} from './risk-rules';

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
  private readonly profileIdentityCache = new AsyncTtlCache(30000);

  private readonly riskCache = new AsyncTtlCache(10000);

  constructor(
    private db: DataSource,
    private cache: BasicSnapshotService,
    private sectors: SectorService,
  ) {}

  async profile(dto: WorkbenchQuery) {
    if (!dto.code) throw new BadRequestException('请选择股票');
    const mapping = await this.profileIdentityCache.getOrCreate('mapping', () =>
      this.db.manager.find(BseMappingEntity),
    );
    const code =
      mapping.find((r) => r.oldCode === dto.code)?.newCode || dto.code;
    const aliases = [
      code,
      ...mapping.filter((r) => r.newCode === code).map((r) => r.oldCode),
    ];
    const date = dto.date || shanghaiDate();
    if (dto.section === 'financial') return this.profileFinancial(code, date);
    const [stock, history] = await Promise.all([
      this.db.manager.findOneBy(StockEntity, { tsCode: code }),
      this.profileIdentityCache.getOrCreate(`identity:${code}`, () =>
        readProfileHistory(this.db, aliases),
      ),
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
    const base = stock || { ...historic?.profile, ...historic, tsCode: code };
    const [company, sectorLinks, financialData, daily] = await Promise.all([
      this.cache.read(
        'stock_company',
        { exchange },
        'ts_code,com_name,chairman,manager,reg_capital,setup_date,province,city,introduction,website,main_business,business_scope',
        aliases,
      ),
      this.sectors.stockLinks(aliases, date),
      dto.section === 'overview' ? null : this.profileFinancial(code, date),
      // The overview does not display a quote. The chart loads its own series on demand.
      dto.section === 'overview'
        ? null
        : this.db.manager
            .getRepository(DailyEntity)
            .createQueryBuilder('d')
            .where('d.tsCode IN (:...aliases) AND d.tradeDate <= :date', {
              aliases,
              date,
            })
            .orderBy('d.tradeDate', 'DESC')
            .take(1)
            .getOne(),
    ]);
    return {
      code,
      date,
      stock: {
        ...base,
        industries: sectorLinks.filter((sector) => sector.type === 'I'),
        topics: sectorLinks.filter((sector) => sector.type === 'N'),
        industry: sectorLinks
          .filter((sector) => sector.type === 'I')
          .map((sector) => sector.name)
          .join('／'),
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
      financial: financialData?.financial || null,
      cashflow: financialData?.cashflow || null,
      sources: [...sourceStatus([company]), ...(financialData?.sources || [])],
    };
  }

  private async profileFinancial(code: string, date: string) {
    const [financial, cashflow] = await Promise.all([
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
    const cashRow = financialRow
      ? latestDisclosed(
          cashflow.rows.filter(
            (r) =>
              String(r.report_type) === '1' &&
              r.end_date === financialRow.end_date,
          ),
          date,
        )
      : null;
    return {
      code,
      date,
      financial: financialRow,
      cashflow: cashRow,
      sources: sourceStatus([financial, cashflow]),
    };
  }

  async risk(dto: WorkbenchQuery) {
    const date = dto.date || shanghaiDate();
    if (date > shanghaiDate())
      throw new BadRequestException('不能核验未来日期的风险');
    return this.riskCache.getOrCreate(
      JSON.stringify([date, shanghaiDate(), dto.code, dto.keyword, dto.sector]),
      () => this.readRisk({ ...dto, date }),
    );
  }

  private async readRisk(dto: WorkbenchQuery & { date: string }) {
    const { date } = dto;
    const mappings = await this.profileIdentityCache.getOrCreate(
      'mapping',
      () =>
        this.db.manager.find(BseMappingEntity, {
          select: { oldCode: true, newCode: true },
        }),
    );
    const canonical = new Map(mappings.map((r) => [r.oldCode, r.newCode]));
    const code = dto.code ? canonical.get(dto.code) || dto.code : undefined;
    const aliases = code
      ? [
          code,
          ...mappings.filter((r) => r.newCode === code).map((r) => r.oldCode),
        ]
      : undefined;
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
      definitions.map(([api, params]) =>
        this.cache.read(api, params, undefined, aliases, true),
      ),
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
              const changes = reasons
                .filter(
                  (v) =>
                    (canonical.get(v.ts_code) || v.ts_code) ===
                    (canonical.get(r.ts_code) || r.ts_code),
                )
                .sort(
                  (a, b) =>
                    String(b.imp_date).localeCompare(String(a.imp_date)) ||
                    String(b.pub_date).localeCompare(String(a.pub_date)),
                );
              const reason = changes[0];
              const announcementDate =
                isoDate(index === 0 ? reason?.pub_date : r.ann_date) || null;
              const effectiveDate =
                isoDate(
                  index === 0
                    ? reason?.imp_date
                    : r.start_date || r.trade_date || date,
                ) || null;
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
                eventDate: index === 0 ? announcementDate || '' : effectiveDate,
                announcementDate,
                effectiveDate,
                statusDate: index === 0 ? date : null,
                ...(index === 0 && {
                  changeType: reason?.st_type || null,
                  changes: changes.map((change) => ({
                    announcementDate: isoDate(change.pub_date),
                    effectiveDate: isoDate(change.imp_date),
                    type: change.st_type,
                    detail: change.st_explain || change.st_reason,
                  })),
                }),
                endDate: isoDate(r.end_date),
                source: snapshot.source,
              };
            }),
    );
    // Current plans are independent of the historical trading/status date selected on this page.
    const reductionDate = shanghaiDate();
    const reductions = [
      await this.cache.read('reduction_plans', {}, undefined, aliases, true),
    ];
    const reductionRecords: Record<string, any>[] = [];
    reductions.forEach((snapshot) =>
      snapshot.rows.forEach((r) => {
        const announced = isoDate(r.ann_date);
        if (
          !/^\d{6}\.(SH|SZ|BJ)$/.test(r.ts_code) ||
          !announced ||
          announced > reductionDate
        )
          return;
        reductionRecords.push({
          tsCode: r.ts_code,
          holderName: (r.holder_names || []).join('、') || null,
          type: '减持',
          recordKind: 'plan',
          planId: r.plan_id,
          url: safeAnnouncementUrl(r.url),
          reductionState: reductionState(r, reductionDate),
          reductionDate,
          date: reductionDate,
          eventDate: announced,
          announcementDate: announced,
          effectiveDate: isoDate(r.plan_start) || null,
          statusDate: null,
          endDate: isoDate(r.plan_end),
          source: snapshot.source,
          detail: `${r.title}；${
            (r.holder_names || []).join('、') || '股东'
          }；计划期间 ${isoDate(r.plan_start) || '待核实'} 至 ${
            isoDate(r.plan_end) || '待核实'
          }。`,
        });
      }),
    );
    const latestReductions = latestReductionRecords(
      reductionRecords.map((r) => ({
        ...r,
        tsCode: canonical.get(r.tsCode) || r.tsCode,
      })),
    );
    items.push(
      ...latestReductions.filter((r) => r.reductionState === 'active'),
    );
    const identify = (
      r: Record<string, any>,
    ): Record<string, any> & { recordId: string } => ({
      ...r,
      tsCode: canonical.get(r.tsCode) || r.tsCode,
      recordId: createHash('sha256')
        .update(
          JSON.stringify([
            canonical.get(r.tsCode) || r.tsCode,
            r.type,
            r.source,
            r.planId,
            r.statusDate,
            r.announcementDate,
            r.effectiveDate,
            r.endDate,
            r.detail,
          ]),
        )
        .digest('hex'),
    });
    items = [
      ...new Map(items.map(identify).map((r) => [r.recordId, r])).values(),
    ];
    const stockMap = code
      ? new Map<string, string>()
      : await this.profileIdentityCache.getOrCreate(
          'risk-directory',
          async () => {
            const [stocks, history] = await Promise.all([
              this.db.manager.find(StockEntity, {
                select: { tsCode: true, name: true },
              }),
              this.db.query(
                `SELECT JSON_EXTRACT(data,'$.stocks[*].tsCode') codes,
               JSON_EXTRACT(data,'$.stocks[*].name') names
               FROM t_source_stock_history WHERE snapshot_key='identity'`,
              ),
            ]);
            const names = new Map(stocks.map((r) => [r.tsCode, r.name]));
            const list = (value: any): string[] => {
              const parsed =
                typeof value === 'string' ? JSON.parse(value) : value;
              if (parsed == null) return [];
              return Array.isArray(parsed) ? parsed : [parsed];
            };
            const oldNames = list(history[0]?.names);
            list(history[0]?.codes).forEach((oldCode, index) => {
              const currentCode = canonical.get(oldCode) || oldCode;
              if (!names.has(currentCode))
                names.set(currentCode, oldNames[index]);
            });
            return names;
          },
        );
    if (code) {
      const stock = await this.db.manager.findOneBy(StockEntity, {
        tsCode: code,
      });
      const archived = stock
        ? null
        : await readProfileHistory(this.db, aliases!);
      const name = stock?.name || archived?.data.stocks[0]?.name;
      if (name) stockMap.set(code, name);
    }
    items = items
      .filter((r) => stockMap.has(r.tsCode))
      .map((r) => ({ ...r, name: r.name || stockMap.get(r.tsCode) }));
    if (code) items = items.filter((r) => r.tsCode === code);
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
      code,
      name: code ? stockMap.get(code) : undefined,
      items: items.sort(
        (a, b) =>
          String(
            b.statusDate || b.announcementDate || b.eventDate,
          ).localeCompare(
            String(a.statusDate || a.announcementDate || a.eventDate),
          ) ||
          a.tsCode.localeCompare(b.tsCode) ||
          a.type.localeCompare(b.type),
      ),
      sources: sourceStatus([...snapshots, ...reductions]),
      reductionDate,
      reductionCoverage: {
        active: items.filter((r) => r.type === '减持').length,
        unknown: latestReductions.filter((r) => r.reductionState === 'unknown')
          .length,
      },
      checklist: RISK_CHECKLIST,
      note: `ST及停复牌按所选日期展示；当前减持计划按今天（${reductionDate}）核验，与左侧日期无关。只展示计划起止日期明确且仍在期间内的计划，已完成、终止、到期及尚未开始的计划不计入。实际股份变动的起止日期不能当作计划期间，资料未核实不表示没有计划。`,
    };
  }

  async riskDetail(dto: WorkbenchQuery) {
    if (!dto.code) throw new BadRequestException('请选择股票');
    const date = dto.date || shanghaiDate();
    if (date > shanghaiDate())
      throw new BadRequestException('不能核验未来日期的风险');
    const mappings = await this.db.manager.find(BseMappingEntity);
    const code =
      mappings.find((r) => r.oldCode === dto.code)?.newCode || dto.code;
    const aliases = [
      code,
      ...mappings.filter((r) => r.newCode === code).map((r) => r.oldCode),
    ];
    const start = dayjs(date).subtract(179, 'day').format('YYYY-MM-DD');
    const [base, announcements, financial, audit, balance] = await Promise.all([
      this.risk({ date, code }),
      Promise.all(
        aliases.map((tsCode) =>
          this.cache.read(
            'eastmoney_ann',
            {
              ts_code: tsCode,
              start_date: compact(start),
              end_date: compact(date),
            },
            'ts_code,ann_date,title,url,rec_time',
          ),
        ),
      ),
      this.cache.read(
        'fina_indicator',
        { ts_code: code },
        'ts_code,ann_date,end_date,or_yoy,netprofit_yoy,profit_dedt,debt_to_assets,update_flag',
      ),
      this.cache.read('fina_audit', { ts_code: code }),
      this.cache.read(
        'balancesheet',
        { ts_code: code },
        'ts_code,ann_date,f_ann_date,end_date,report_type,total_hldr_eqy_exc_min_int,update_flag',
      ),
    ]);
    const notices = [
      ...new Map(
        announcements
          .flatMap((s) => s.rows)
          .filter(
            (r) =>
              aliases.includes(r.ts_code) &&
              isoDate(r.ann_date) >= start &&
              isoDate(r.ann_date) <= date &&
              (!r.rec_time || isoDate(r.rec_time) <= date),
          )
          .map((r) => ({
            title: String(r.title || ''),
            date: isoDate(r.ann_date),
            url: safeAnnouncementUrl(r.url),
            categories: announcementCategories(String(r.title || '')),
          }))
          .map((r) => [JSON.stringify([r.date, r.title, r.url]), r]),
      ).values(),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const fin = latestDisclosed(financial.rows, date);
    const aud = latestDisclosed(audit.rows, date);
    const bal = latestDisclosed(
      balance.rows.filter((r) => String(r.report_type) === '1'),
      date,
    );
    const findings: { category: string; detail: string; date: string }[] = [];
    if (fin?.profit_dedt != null && Number(fin.profit_dedt) < 0)
      findings.push({
        category: 'financial',
        detail: `报告期 ${isoDate(fin.end_date)} 扣非净利润为负（${Number(
          fin.profit_dedt,
        )}元）；需结合营收与适用规则复核`,
        date: isoDate(fin.ann_date),
      });
    if (aud?.audit_result && aud.audit_result !== '标准无保留意见')
      findings.push({
        category: 'financial',
        detail: `报告期 ${isoDate(aud.end_date)} 审计意见：${aud.audit_result}`,
        date: isoDate(aud.ann_date),
      });
    if (
      bal?.total_hldr_eqy_exc_min_int != null &&
      Number(bal.total_hldr_eqy_exc_min_int) < 0
    )
      findings.push({
        category: 'financial',
        detail: `报告期 ${isoDate(bal.end_date)} 归属母公司净资产为负`,
        date: isoDate(bal.f_ann_date || bal.ann_date),
      });
    return {
      ...base,
      code,
      board: stockBoard(code),
      announcementStart: start,
      generatedAt: new Date().toISOString(),
      announcements: notices,
      findings,
      financial: fin,
      audit: aud,
      balance: bal,
      sources: [
        ...base.sources,
        ...sourceStatus([...announcements, financial, audit, balance]),
      ],
      checks: RISK_CHECKLIST.map((check) => {
        const evidence = [
          ...(check.key === 'reduction'
            ? base.items
                .filter((r) => r.type === '减持')
                .map((r) => ({
                  categories: ['reduction'],
                  date: r.announcementDate,
                  title: r.detail,
                  url: r.url,
                }))
            : notices
          )
            .filter(
              (r) =>
                r.categories.includes(check.key) &&
                (check.key !== 'reduction' || !terminalReduction(r.title)),
            )
            .map((r) => ({
              kind: 'announcement',
              date: r.date,
              title: r.title,
              url: r.url,
            })),
          ...findings
            .filter((r) => r.category === check.key)
            .map((r) => ({
              kind: 'financial',
              date: r.date,
              title: r.detail,
              url: null,
            })),
        ];
        const relevant = [
          ...(check.key === 'reduction' ? [] : announcements),
          ...(check.key === 'financial' ? [financial, audit, balance] : []),
        ];
        const incomplete =
          relevant.some((s) => s.state !== 'ready') ||
          (check.key === 'reduction' &&
            ((base.reductionCoverage?.unknown || 0) > 0 ||
              base.sources.some(
                (s) => s.source === 'reduction_plans' && s.state !== 'ready',
              )));
        return {
          ...check,
          ...(check.key === 'reduction' && {
            activeCount: base.items.filter((r) => r.type === '减持').length,
          }),
          evidence,
          leads: evidence.length,
          state: evidence.length
            ? 'leads'
            : incomplete
            ? 'incomplete'
            : 'no_matches',
          requiresReview: true,
        };
      }),
      note: '标题匹配和财务异常提供待核实线索。未检索到相关线索不表示没有风险，具体影响需结合公告正文和适用规则核对。',
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
