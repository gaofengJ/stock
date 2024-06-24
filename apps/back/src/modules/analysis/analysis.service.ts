import { Injectable, Logger } from '@nestjs/common';
import { CommonDto } from '@/dto/common.dto';
import { TradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BusinessException } from '@/exceptions/business.exception';
import { EError } from '@/constants';
import { DailyService } from '@/modules/source/daily/daily.service';
import { LimitService } from '@/modules/source/limit/limit.service';
import { ELimit } from '@/modules/source/limit/limit.enum';
import { SentiService } from '@/modules/processed/senti/senti.service';

type ILimitsResItem = {
  tradeDate: string;
  up: number;
  down: number;
};

type INumsResItem = {
  tradeDate: string;
  sum: number;
};

@Injectable()
export class AnalysisService {
  private logger = new Logger(AnalysisService.name);

  constructor(
    private tradeCalService: TradeCalService,
    private dailyService: DailyService,
    private limitService: LimitService,
    private sentiService: SentiService,
  ) {}

  private getRangeIndex(pctChg: number): number {
    const ranges = [
      -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ];
    if (pctChg <= -9) return 0;
    if (pctChg > 9) return 20;
    return ranges.findIndex((range) => pctChg < range) + 1;
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
  async statistics(date: CommonDto['date']) {
    const isOpen = await this.tradeCalService.isOpen(date);
    if (!isOpen) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BusinessException(EError.NON_TRADING_DAY);
    }

    const { items: dailyItems } = await this.dailyService.list({
      pageNum: 1,
      pageSize: 10000,
    });
    const dailyPctChgItems = dailyItems.map((i) => i.pctChg);

    const ret = this.initializeRet();

    for (let i = 0; i < dailyPctChgItems.length; i += 1) {
      const index = this.getRangeIndex(i);
      ret[index].value += 1;
    }

    return ret;
  }

  /**
   * 涨跌停统计
   */
  async limits(dto: Pick<CommonDto, 'startDate' | 'endDate'>) {
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
    const ret: ILimitsResItem[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const [key, value] of map.entries()) {
      ret.push({
        tradeDate: key,
        ...value,
      } as ILimitsResItem);
    }
    return ret;
  }

  /**
   * 上涨家数
   */
  async nums(dto: Pick<CommonDto, 'startDate' | 'endDate'>) {
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
  async senti(dto: Pick<CommonDto, 'startDate' | 'endDate'>) {
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
