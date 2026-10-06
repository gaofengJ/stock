import { Injectable, Logger, Optional } from '@nestjs/common';
import { SectorService } from '@/modules/analysis/market/sector.service';
import { CommonDateDto } from '@/dto/common.dto';
import { BizException } from '@/exceptions/biz.exception';
import { ECustomError } from '@/types/common.enum';
import { TradeCalService } from '../source/trade-cal/trade-cal.service';
import { DailyService } from '../source/daily/daily.service';
import { StrategyListQueryDto } from './strategy.dto';
import { EStrategyType } from './strategy.enum';
import { DailyEntity } from '../source/daily/daily.entity';
import { TrendService } from './trend.service';
import { TREND_KEYS, TrendKey, TREND_DEFAULTS } from './trend-rules';
import { StrategyCacheService } from './strategy-cache.service';
import { StrategyReadService } from './strategy-read.service';
import { InsightService } from './insight.service';

@Injectable()
export class StrategyService {
  constructor(
    private tradeCalService: TradeCalService,
    private dailyService: DailyService,
    @Optional() private sectors?: SectorService,
    @Optional() private trends?: TrendService,
    @Optional() private cache?: StrategyCacheService,
    @Optional() private reads?: StrategyReadService,
    @Optional() private insights?: InsightService,
  ) {}

  private logger = new Logger(StrategyService.name);

  /**
   * 策略选股结果列表-向上跳空缺口后三连阳
   */
  async gapThreeUp(date: CommonDateDto['date'], minTurnoverRateF = 5) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的四个交易日
    const last4Days = await this.tradeCalService.getLastNDays({
      date,
      n: 4,
    });

    const dates = last4Days.map((i) => i.calDate);
    // dates[0] is latest (date4), dates[3] is oldest (date1)
    return this.dailyService.findGapThreeUp(
      dates,
      await this.reads?.sequence(dates, true, 'gapThreeUp', minTurnoverRateF),
      minTurnoverRateF,
    );
  }

  /**
   * 策略选股结果列表-向上跳空缺口后二连阳
   */
  async gapTwoUp(date: CommonDateDto['date'], minTurnoverRateF = 5) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的三个交易日
    const last3Days = await this.tradeCalService.getLastNDays({
      date,
      n: 3,
    });

    const dates = last3Days.map((i) => i.calDate);
    // dates[0] is latest (date3), dates[2] is oldest (date1)
    return this.dailyService.findGapTwoUp(
      dates,
      await this.reads?.sequence(dates, true, 'gapTwoUp', minTurnoverRateF),
      minTurnoverRateF,
    );
  }

  /**
   * 策略选股结果列表-向上跳空缺口后连续三日高换手率
   */
  async gapThreeHighTurnover(
    date: CommonDateDto['date'],
    minTurnoverRateF = 5,
  ) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的四个交易日
    const last4Days = await this.tradeCalService.getLastNDays({
      date,
      n: 4,
    });

    const dates = last4Days.map((i) => i.calDate);
    return this.dailyService.findGapThreeHighTurnover(
      dates,
      await this.reads?.sequence(
        dates,
        false,
        'gapThreeHighTurnover',
        minTurnoverRateF,
      ),
      minTurnoverRateF,
    );
  }

  /**
   * 策略选股结果列表-连续三日收阳
   */
  async threeDaysHighVol(date: CommonDateDto['date'], minTurnoverRateF = 5) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的三个交易日
    const last3Days = await this.tradeCalService.getLastNDays({
      date,
      n: 3,
    });

    const dates = last3Days.map((i) => i.calDate);
    return this.dailyService.findThreeDaysHighVol(
      dates,
      await this.reads?.sequence(
        dates,
        true,
        'threeDaysHighVol',
        minTurnoverRateF,
      ),
      minTurnoverRateF,
    );
  }

  /**
   * 策略选股结果列表-连续两次向上缺口
   */
  async continuousGap(date: CommonDateDto['date'], minTurnoverRateF = 5) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的三个交易日，依次对应今天、昨天、前天
    const last3Days = await this.tradeCalService.getLastNDays({
      date,
      n: 3,
    });

    const dates = last3Days.map((i) => i.calDate);
    return this.dailyService.findContinuousGap(
      dates,
      await this.reads?.sequence(
        dates,
        false,
        'continuousGap',
        minTurnoverRateF,
      ),
      minTurnoverRateF,
    );
  }

  /**
   * 策略选股结果列表-向上跳空上影反包
   */
  async shadowWrap(date: CommonDateDto['date'], minTurnoverRateF = 5) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }
    // 获取过去的三个交易日，依次对应第二天、第一天、基准日
    const last3Days = await this.tradeCalService.getLastNDays({
      date,
      n: 3,
    });

    const dates = last3Days.map((i) => i.calDate);
    return this.dailyService.findShadowWrap(
      dates,
      await this.reads?.sequence(dates, true, 'shadowWrap', minTurnoverRateF),
      minTurnoverRateF,
    );
  }

  /**
   * 策略名称列表
   */
  async navList() {
    const ret = [
      {
        label: '向上跳空缺口后三连阳',
        key: EStrategyType.gapThreeUp,
      },
      {
        label: '向上跳空缺口后二连阳',
        key: EStrategyType.gapTwoUp,
      },
      {
        label: '向上跳空缺口后连续三日高换手率',
        key: EStrategyType.gapThreeHighTurnover,
      },
      {
        label: '连续三日收阳',
        key: EStrategyType.threeDaysHighVol,
      },
      {
        label: '连续两次向上缺口',
        key: EStrategyType.continuousGap,
      },
      {
        label: '向上跳空上影反包',
        key: EStrategyType.shadowWrap,
      },
      { label: '放量突破阶段高点', key: EStrategyType.volumeBreakout },
      { label: '突破后缩量回踩企稳', key: EStrategyType.breakoutPullback },
      { label: '五线顺上', key: EStrategyType.fiveMaUp },
    ];
    return ret;
  }

  /**
   * 策略选股结果列表
   */
  async list(dto: StrategyListQueryDto) {
    const { sector, date, strategyType } = dto;
    const parameters: StrategyListQueryDto = TREND_KEYS.includes(
      strategyType as TrendKey,
    )
      ? {
          ...TREND_DEFAULTS,
          ...dto,
          sector: undefined,
          includeLabels: undefined,
        }
      : { date, strategyType, minTurnoverRateF: dto.minTurnoverRateF ?? 5 };
    if (strategyType === 'volumeBreakout')
      parameters.minTurnoverRateF = dto.minTurnoverRateF ?? 5;
    if (strategyType === 'breakoutPullback' || strategyType === 'fiveMaUp')
      delete parameters.minTurnoverRateF;
    // Volume options do not change five-MA results unless enabled.
    if (strategyType === 'fiveMaUp' && !parameters.expandingVolume) {
      parameters.volumeDays = TREND_DEFAULTS.volumeDays;
      parameters.volumeMultiple = TREND_DEFAULTS.volumeMultiple;
    }
    let rows = this.cache
      ? await this.cache.read(date, parameters, () =>
          this.candidates(parameters),
        )
      : await this.candidates(parameters);
    if (sector && this.sectors) {
      const members = await this.sectors.codes(sector, date);
      rows = rows.filter((row) => members.has(row.tsCode));
    }
    if (dto.includeLabels === false) return rows;
    // Only membership labels belong on the critical path. Board performance is
    // requested separately when the user enables the corresponding column.
    if (this.reads && rows.length <= 20) return this.reads.decorate(rows, date);
    return this.sectors ? this.sectors.decorate(rows, date) : rows;
  }

  async labels(date: string, codes: string[]) {
    const rows = codes.map((tsCode) => ({ tsCode }) as DailyEntity);
    if (this.reads && rows.length <= 20) return this.reads.decorate(rows, date);
    return this.sectors ? this.sectors.decorate(rows, date) : rows;
  }

  async context(date: string, codes: string[]) {
    if (!codes.length || !this.sectors) return [];
    return this.sectors.candidateContext(
      codes.map((tsCode) => ({ tsCode })),
      date,
    );
  }

  async chart(dto: StrategyListQueryDto & { code: string }) {
    if (!this.trends) throw new Error('趋势策略模块尚未启用');
    return this.trends.chart(dto);
  }

  private async candidates(dto: StrategyListQueryDto) {
    const { date, strategyType } = dto;
    let ret: DailyEntity[] = [];
    if (TREND_KEYS.includes(strategyType as TrendKey)) {
      if (!this.trends) throw new Error('趋势策略模块尚未启用');
      const codes = await this.insights?.standardCandidates(
        date,
        strategyType,
        dto,
      );
      ret = await this.trends.list(date, strategyType as TrendKey, dto, codes);
      if (codes) {
        const current = await this.insights?.standardCandidates(
          date,
          strategyType,
          dto,
        );
        if (
          !current ||
          JSON.stringify([...current].sort()) !==
            JSON.stringify([...codes].sort())
        ) {
          ret = await this.trends.list(date, strategyType as TrendKey, dto);
        }
      }
      return ret;
    }
    switch (strategyType) {
      case EStrategyType.gapThreeUp:
        ret = await this.gapThreeUp(date, dto.minTurnoverRateF);
        break;
      case EStrategyType.gapTwoUp:
        ret = await this.gapTwoUp(date, dto.minTurnoverRateF);
        break;
      case EStrategyType.gapThreeHighTurnover:
        ret = await this.gapThreeHighTurnover(date, dto.minTurnoverRateF);
        break;
      case EStrategyType.threeDaysHighVol:
        ret = await this.threeDaysHighVol(date, dto.minTurnoverRateF);
        break;
      case EStrategyType.continuousGap:
        ret = await this.continuousGap(date, dto.minTurnoverRateF);
        break;
      case EStrategyType.shadowWrap:
        ret = await this.shadowWrap(date, dto.minTurnoverRateF);
        break;
      default:
        ret = [];
        break;
    }
    return ret;
  }
}
