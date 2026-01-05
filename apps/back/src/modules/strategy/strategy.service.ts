import { Injectable, Logger } from '@nestjs/common';
import { CommonDateDto } from '@/dto/common.dto';
import { BizException } from '@/exceptions/biz.exception';
import { ECustomError } from '@/types/common.enum';
import { TradeCalService } from '../source/trade-cal/trade-cal.service';
import { DailyService } from '../source/daily/daily.service';
import { StrategyListQueryDto } from './strategy.dto';
import { EStrategyType } from './strategy.enum';
import { DailyEntity } from '../source/daily/daily.entity';

@Injectable()
export class StrategyService {
  constructor(
    private tradeCalService: TradeCalService,
    private dailyService: DailyService,
  ) {}

  private logger = new Logger(StrategyService.name);

  /**
   * 策略选股结果列表-向上跳空缺口后三连阳
   */
  async gapThreeUp(date: CommonDateDto['date']) {
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
    return this.dailyService.findGapThreeUp(dates);
  }

  /**
   * 策略选股结果列表-向上跳空缺口后二连阳
   */
  async gapTwoUp(date: CommonDateDto['date']) {
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
    return this.dailyService.findGapTwoUp(dates);
  }

  /**
   * 策略选股结果列表-向上跳空缺口后连续三日高换手率
   */
  async gapThreeHighTurnover(date: CommonDateDto['date']) {
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
    return this.dailyService.findGapThreeHighTurnover(dates);
  }

  /**
   * 策略选股结果列表-连续三日放量且量能不萎缩
   */
  async threeDaysHighVol(date: CommonDateDto['date']) {
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
    return this.dailyService.findThreeDaysHighVol(dates);
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
        label: '连续三日放量且量能不萎缩',
        key: EStrategyType.threeDaysHighVol,
      },
    ];
    return ret;
  }

  /**
   * 策略选股结果列表
   */
  async list(dto: StrategyListQueryDto) {
    const { date, strategyType } = dto;
    let ret: DailyEntity[] = [];
    switch (strategyType) {
      case EStrategyType.gapThreeUp:
        ret = await this.gapThreeUp(date);
        break;
      case EStrategyType.gapTwoUp:
        ret = await this.gapTwoUp(date);
        break;
      case EStrategyType.gapThreeHighTurnover:
        ret = await this.gapThreeHighTurnover(date);
        break;
      case EStrategyType.threeDaysHighVol:
        ret = await this.threeDaysHighVol(date);
        break;
      default:
        ret = [];
        break;
    }
    return ret;
  }
}
