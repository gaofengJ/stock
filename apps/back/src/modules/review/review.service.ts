/* eslint-disable no-await-in-loop, no-restricted-syntax */
import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { StrategyService } from '@/modules/strategy/strategy.service';
import { TrendService } from '@/modules/strategy/trend.service';
import { WorkbenchService } from '@/modules/basic/workbench/workbench.service';
import { observedRisk } from '@/modules/basic/workbench/risk-rules';
import { latestSyncDate } from '@/modules/daily-task/sync.utils';
import { HoldingsDto } from './review.dto';
import { capStatus, ma5Observation, positiveNumber } from './review-rules';

@Injectable()
export class ReviewService {
  constructor(
    private db: DataSource,
    private strategies: StrategyService,
    private trends: TrendService,
    private workbench: WorkbenchService,
  ) {}

  private async validateDate(date: string) {
    if (date > latestSyncDate())
      throw new BadRequestException('请选择已完成日线同步的交易日');
    const rows = await this.db.query(
      `SELECT c.cal_date FROM t_source_trade_cal c JOIN t_sync_run r ON r.trade_date=c.cal_date AND r.task='daily' AND r.status='success'
      LEFT JOIN t_sync_day_policy p ON p.trade_date=c.cal_date WHERE c.cal_date=? AND c.is_open=1 AND p.trade_date IS NULL`,
      [date],
    );
    if (!rows.length)
      throw new BadRequestException(
        '该日非交易日、行情未同步完成或已受删除保护',
      );
  }

  async report(date: string) {
    await this.validateDate(date);
    const tabs = await this.strategies.navList();
    const merged = new Map<string, any>();
    const coverage: {
      key: string;
      label: string;
      state: string;
      count: number | null;
    }[] = [];
    // Registry-driven, bounded concurrency. One unavailable strategy must remain visible.
    for (let i = 0; i < tabs.length; i += 2) {
      const batch = tabs.slice(i, i + 2);
      const results = await Promise.allSettled(
        batch.map((tab) =>
          this.strategies.list({ date, strategyType: tab.key }),
        ),
      );
      results.forEach((result, index) => {
        const tab = batch[index];
        coverage.push({
          ...tab,
          state: result.status === 'fulfilled' ? 'ready' : 'unavailable',
          count: result.status === 'fulfilled' ? result.value.length : null,
        });
        if (result.status !== 'fulfilled') return;
        result.value.forEach((row) => {
          const previous = merged.get(row.tsCode);
          if (previous) previous.strategies.push(tab);
          else merged.set(row.tsCode, { ...row, strategies: [tab] });
        });
      });
    }
    const risk = await this.workbench.risk({ date });
    const items = [...merged.values()]
      .map((row) => ({
        ...row,
        capState: capStatus(row.totalMv),
        risk: observedRisk(risk.items, row.tsCode, row.name),
      }))
      .sort(
        (a, b) =>
          (positiveNumber(a.circMv) ?? Infinity) -
            (positiveNumber(b.circMv) ?? Infinity) ||
          a.tsCode.localeCompare(b.tsCode),
      );
    return {
      date,
      generatedAt: new Date().toISOString(),
      complete: coverage.every((r) => r.state === 'ready'),
      strategies: coverage,
      items,
      counts: {
        unique: items.length,
        withinCap: items.filter((r) => r.capState === 'within').length,
        excluded: items.filter((r) => r.risk.state === 'excluded').length,
        missingCap: items.filter((r) => r.capState === 'missing').length,
      },
      sources: risk.sources,
      riskNote: risk.note,
      profile: {
        maxTotalCapYi: 200,
        maxSelections: 3,
        holdingDays: '1–10个交易日，短线优先',
        source: '平台全部策略，使用各策略默认参数',
        sorting: '流通市值升序；缺失排末尾；不设股价硬阈值',
        rules: [
          '看图判断走势，不把多策略命中等同于更高胜率',
          '竞价／开盘观察，或等待回踩支撑',
          '跌破5日线后下一交易日未收回，优先复核',
          '约3个交易日未走强，复核原买入逻辑',
          '减持、重大利空与各类ST／退市风险须核验',
        ],
      },
    };
  }

  async holdings(dto: HoldingsDto) {
    await this.validateDate(dto.date);
    for (const holding of dto.holdings) {
      if (holding.boughtOn && holding.boughtOn > dto.date)
        throw new BadRequestException('买入日期不能晚于复盘日期');
      if (holding.boughtOn) {
        const open = await this.db.query(
          'SELECT cal_date FROM t_source_trade_cal WHERE cal_date=? AND is_open=1',
          [holding.boughtOn],
        );
        if (!open.length) throw new BadRequestException('买入日期必须为交易日');
      }
    }
    // Inputs exist only for this request: no user positions in shared caches, DB or URLs.
    const items = [];
    const canonical = new Set<string>();
    for (const holding of dto.holdings) {
      const chart = await this.trends.chart(
        {
          date: dto.date,
          code: holding.code,
          strategyType: 'fiveMaUp',
        },
        6,
        false,
      );
      if (canonical.has(chart.code))
        throw new BadRequestException('同一股票的新旧代码不能重复输入');
      canonical.add(chart.code);
      const quotes = await this.db.query(
        "SELECT name,close,DATE_FORMAT(trade_date,'%Y-%m-%d') date FROM t_source_daily WHERE ts_code=? AND trade_date=?",
        [chart.code, dto.date],
      );
      const quote = quotes[0];
      if (!chart.series.some((r) => r.close != null))
        throw new BadRequestException(`${holding.code} 暂无可用行情`);
      let heldDays: number | null = null;
      if (holding.boughtOn) {
        const [count] = await this.db.query(
          'SELECT COUNT(*) n FROM t_source_trade_cal WHERE cal_date BETWEEN ? AND ? AND is_open=1',
          [holding.boughtOn, dto.date],
        );
        heldDays = Number(count.n);
      }
      const close = positiveNumber(quote?.close);
      items.push({
        ...holding,
        code: chart.code,
        name: quote?.name || chart.code,
        close,
        heldDays,
        basis: chart.basis,
        profitPct:
          holding.cost && close ? (close / holding.cost - 1) * 100 : null,
        ma5: ma5Observation(chart.series, dto.date),
        timeReview:
          heldDays != null && heldDays >= 3
            ? '已持有至少3个交易日，请结合走势判断是否走强；天数本身不触发卖出'
            : '待复核买入逻辑与走势强度',
      });
    }
    return {
      date: dto.date,
      items,
      generatedAt: new Date().toISOString(),
      note: '持有天数含买入日；均线使用连续交易日复权价；成本收益仅为现价与输入成本的价格差，不含分红、费用及仓位。',
    };
  }
}
