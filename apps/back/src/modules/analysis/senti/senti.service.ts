import { Injectable, Logger } from '@nestjs/common';
import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';
import { TradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BizException } from '@/exceptions/biz.exception';
import { DailyService } from '@/modules/source/daily/daily.service';
import { LimitService } from '@/modules/source/limit/limit.service';
import { ELimit } from '@/modules/source/limit/limit.enum';
import { SentiService as SourceSentiService } from '@/modules/processed/senti/senti.service';
import { ECustomError } from '@/types/common.enum';

type ISentiResItem = {
  tradeDate: string;
  up: number;
  down: number;
};

type INumsResItem = {
  tradeDate: string;
  sum: number;
};

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
    return keys.map((key) => ({ key, value: 0 }));
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
    console.info('dailyItems', dailyItems.length);
    const dailyPctChgItems = dailyItems.map((i) => i.pctChg);

    const ret = this.initializeRet();

    for (let i = 0; i < dailyPctChgItems.length; i += 1) {
      const index = this.getRangeIndex(+dailyPctChgItems[i]);
      ret[index].value += 1;
    }

    return ret;
  }

  /**
   * 涨跌停统计
   */
  async limitUpDownTatistics(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const { items: limitItems } = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });
    const map = new Map<string, Record<string, number>>();
    for (let i = 0; i < limitItems.length; i += 1) {
      const limitItem = limitItems[i];
      if (map.has(limitItem.tradeDate)) {
        if (limitItem.limit === ELimit.U) {
          (map.get(limitItem.tradeDate) as any).up += 1;
        }
        if (limitItem.limit === ELimit.D) {
          (map.get(limitItem.tradeDate) as any).down += 1;
        }
      } else {
        map.set(limitItem.tradeDate, {
          up: limitItem.limit === ELimit.U ? 1 : 0,
          down: limitItem.limit === ELimit.D ? 1 : 0,
        });
      }
    }
    const ret: ISentiResItem[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of map.entries()) {
      ret.push({
        tradeDate: key,
        ...value,
      } as ISentiResItem);
    }
    return ret;
  }

  /**
   * 上涨家数
   */
  async upCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const { items: dailyItems } = await this.dailyService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });

    const map = new Map<string, number>();
    for (let i = 0; i < dailyItems.length; i += 1) {
      const dailyItem = dailyItems[i];
      if (map.has(dailyItem.tradeDate)) {
        if (+dailyItem.pctChg > 0) {
          map.set(dailyItem.tradeDate, (map.get(dailyItem.tradeDate) || 0) + 1);
        }
      } else {
        map.set(dailyItem.tradeDate, 1);
      }
    }
    const ret: INumsResItem[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of map.entries()) {
      ret.push({
        tradeDate: key,
        sum: value,
      } as INumsResItem);
    }
    return ret;
  }

  /**
   * 短线情绪
   */
  async list(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const { items: sentiItems } = await this.sentiService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });

    return sentiItems;
  }
}
