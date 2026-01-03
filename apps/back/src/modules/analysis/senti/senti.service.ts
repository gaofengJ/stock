import { Injectable, Logger } from '@nestjs/common';
import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';
import { TradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BizException } from '@/exceptions/biz.exception';
import { DailyService } from '@/modules/source/daily/daily.service';
import { LimitService } from '@/modules/source/limit/limit.service';
import { SentiService as SourceSentiService } from '@/modules/processed/senti/senti.service';
import { ECustomError } from '@/types/common.enum';

@Injectable()
export class SentiService {
  private logger = new Logger(SentiService.name);

  constructor(
    private tradeCalService: TradeCalService,
    private dailyService: DailyService,
    private limitService: LimitService,
    private sentiService: SourceSentiService,
  ) {}

  private initializeRet() {
    const keys = [
      '<-9',
      '-9~-8',
      '-8~-7',
      '-7~-6',
      '-6~-5',
      '-5~-4',
      '-4~-3',
      '-3~-2',
      '-2~-1',
      '-1~0',
      '0',
      '0~1',
      '1~2',
      '2~3',
      '3~4',
      '4~5',
      '5~6',
      '6~7',
      '7~8',
      '8~9',
      '>9',
    ];
    return keys.map((key) => ({ tradeDate: key, count: 0 }));
  }

  /**
   * 涨跌分布统计
   * @param date
   */
  async distributionTatistics(date: CommonDateDto['date']) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }

    const counts = await this.dailyService.getDistributionStatistics(date);

    const ret = this.initializeRet();

    for (let i = 0; i < counts.length; i += 1) {
      if (ret[i]) {
        ret[i].count = counts[i];
      }
    }

    return ret;
  }

  /**
   * 连日涨跌统计
   */
  async upDownCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const ret = await this.dailyService.upDownCount({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });
    return ret;
  }

  /**
   * 连日涨跌停统计
   */
  async limitUpDownCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const ret = await this.limitService.limitUpDownCount({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });
    return ret;
  }

  /**
   * 连日涨停板高度统计
   */
  async limitUpMaxTimesCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const ret = await this.limitService.limitUpMaxTimesCount({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });
    return ret;
  }

  /**
   * 短线情绪
   */
  async list(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const ret = await this.sentiService.list({
      startDate,
      endDate,
    });
    return ret;
  }
}
