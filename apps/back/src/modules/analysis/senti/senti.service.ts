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

  private getRangeIndex(pctChg: number): number {
    if (pctChg <= -9) return 0;
    if (pctChg > -9 && pctChg <= -8) return 1;
    if (pctChg > -8 && pctChg <= -7) return 2;
    if (pctChg > -7 && pctChg <= -6) return 3;
    if (pctChg > -6 && pctChg <= -5) return 4;
    if (pctChg > -5 && pctChg <= -4) return 5;
    if (pctChg > -4 && pctChg <= -3) return 6;
    if (pctChg > -3 && pctChg <= -2) return 7;
    if (pctChg > -2 && pctChg <= -1) return 8;
    if (pctChg > -1 && pctChg < 0) return 9;
    if (pctChg === 0) return 10;
    if (pctChg > 0 && pctChg < 1) return 11;
    if (pctChg >= 1 && pctChg < 2) return 12;
    if (pctChg >= 2 && pctChg < 3) return 13;
    if (pctChg >= 3 && pctChg < 4) return 14;
    if (pctChg >= 4 && pctChg < 5) return 15;
    if (pctChg >= 5 && pctChg < 6) return 16;
    if (pctChg >= 6 && pctChg < 7) return 17;
    if (pctChg >= 7 && pctChg < 8) return 18;
    if (pctChg >= 8 && pctChg < 9) return 19;
    if (pctChg >= 9) return 20;
    return -1;
  }

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

    const { items: dailyItems } = await this.dailyService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate: date,
    });
    const dailyPctChgItems = dailyItems.map((i) => i.pctChg);

    const ret = this.initializeRet();

    for (let i = 0; i < dailyPctChgItems.length; i += 1) {
      const index = this.getRangeIndex(+dailyPctChgItems[i]);
      ret[index].count += 1;
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
