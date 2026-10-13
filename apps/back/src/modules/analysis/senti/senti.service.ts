import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';
import { TradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BizException } from '@/exceptions/biz.exception';
import { DailyService } from '@/modules/source/daily/daily.service';
import { LimitService } from '@/modules/source/limit/limit.service';
import { SentiService as SourceSentiService } from '@/modules/processed/senti/senti.service';
import { ECustomError } from '@/types/common.enum';
import { EIsOpen } from '@/modules/source/trade-cal/trade-cal.enum';
import {
  fillTradeDateSeries,
  sortTradeDays,
  applySeriesStates,
  readSeriesStates,
} from '@/modules/analysis/series.utils';
import { AsyncTtlCache } from '@/modules/analysis/async-ttl-cache';

@Injectable()
export class SentiService {
  private logger = new Logger(SentiService.name);

  private readonly queryCache = new AsyncTtlCache(5000);

  constructor(
    private tradeCalService: TradeCalService,
    private dailyService: DailyService,
    private limitService: LimitService,
    private sentiService: SourceSentiService,
    private db: DataSource,
  ) {}

  private async getOpenTradeDays(startDate: string, endDate: string) {
    return this.queryCache.getOrCreate(
      `trade-days:${startDate}:${endDate}`,
      async () => {
        const { items } = await this.tradeCalService.list({
          pageNum: 1,
          pageSize: 10000,
          startDate,
          endDate,
          isOpen: EIsOpen.OPENED,
        });
        return sortTradeDays(items);
      },
    );
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
    const [counts, states] = await Promise.all([
      this.dailyService.getDistributionStatistics(date),
      readSeriesStates(this.db, [{ calDate: date }]),
    ]);
    const state = states.get(date);
    if (!state) {
      this.logger.log(`${date}非交易日，请重新选择交易日期`);
      throw new BizException(ECustomError.NON_TRADING_DAY);
    }

    const ret = this.initializeRet();

    for (let i = 0; i < counts.length; i += 1) {
      if (ret[i]) {
        ret[i].count = counts[i];
      }
    }

    return ret.map((row) => ({
      ...row,
      count: state === 'ready' ? row.count : null,
      state,
    }));
  }

  /**
   * 连日涨跌统计
   */
  async upDownCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const [ret, tradeDays] = await Promise.all([
      this.dailyService.upDownCount({
        pageNum: 1,
        pageSize: 10000,
        startDate,
        endDate,
      }),
      this.getOpenTradeDays(startDate, endDate),
    ]);
    return applySeriesStates(
      fillTradeDateSeries(tradeDays, ret, (tradeDate) => ({
        tradeDate,
        upCount: 0,
        flatCount: 0,
        downCount: 0,
      })),
      await readSeriesStates(this.db, tradeDays),
      ['upCount', 'flatCount', 'downCount'],
    );
  }

  /**
   * 连日涨跌停统计
   */
  async limitUpDownCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const [ret, tradeDays] = await Promise.all([
      this.limitService.limitUpDownCount({
        pageNum: 1,
        pageSize: 10000,
        startDate,
        endDate,
      }),
      this.getOpenTradeDays(startDate, endDate),
    ]);
    return applySeriesStates(
      fillTradeDateSeries(tradeDays, ret, (tradeDate) => ({
        tradeDate,
        limitUCount: 0,
        limitDCount: 0,
        limitZCount: 0,
      })),
      await readSeriesStates(this.db, tradeDays),
      ['limitUCount', 'limitDCount', 'limitZCount'],
    );
  }

  /**
   * 连日涨停板高度统计
   */
  async limitUpMaxTimesCount(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const [ret, tradeDays] = await Promise.all([
      this.limitService.limitUpMaxTimesCount({
        pageNum: 1,
        pageSize: 10000,
        startDate,
        endDate,
      }),
      this.getOpenTradeDays(startDate, endDate),
    ]);
    return applySeriesStates(
      fillTradeDateSeries(tradeDays, ret, (tradeDate) => ({
        tradeDate,
        maxLimitTimes: 0,
      })),
      await readSeriesStates(this.db, tradeDays),
      ['maxLimitTimes'],
    );
  }

  /**
   * 短线情绪
   */
  async list(dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const [rows, tradeDays] = await Promise.all([
      this.queryCache.getOrCreate(`senti-list:${startDate}:${endDate}`, () =>
        this.sentiService.list({ startDate, endDate }),
      ),
      this.getOpenTradeDays(startDate, endDate),
    ]);
    const states = await readSeriesStates(this.db, tradeDays);
    const completeStates = new Map(states);
    const storedDates = new Set(rows.map((row) => row.tradeDate));
    tradeDays.forEach(({ calDate, preTradeDate }) => {
      if (states.get(calDate) !== 'ready') return;
      // Sentiment depends on prior raw quotes, not a prior sentiment row.
      completeStates.set(
        calDate,
        storedDates.has(calDate)
          ? states.get(preTradeDate || '') || 'missing'
          : 'missing',
      );
    });
    return applySeriesStates(
      fillTradeDateSeries(
        tradeDays,
        rows,
        (tradeDate) =>
          ({
            tradeDate,
            a: 0,
            b: 0,
            c: 0,
            d: 0,
            e: 0,
            sentiA: '0',
            sentiB: '0',
            sentiC: '0',
            sentiD: '0',
          }) as (typeof rows)[number],
      ),
      completeStates,
      ['a', 'b', 'c', 'd', 'e', 'sentiA', 'sentiB', 'sentiC', 'sentiD'],
    );
  }
}
