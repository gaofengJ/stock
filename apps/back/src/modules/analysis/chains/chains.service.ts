import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LimitService as SourceLimitService } from '@/modules/source/limit/limit.service';
import { TradeCalService as SourceTradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { ELimit } from '@/modules/source/limit/limit.enum';
import { EIsOpen } from '@/modules/source/trade-cal/trade-cal.enum';
import {
  calculateFirstUpgradeRates,
  calculateUpgradeRates,
  fillAmountSeries,
  fillCountSeries,
  sortTradeDays,
  applySeriesStates,
  readSeriesStates,
} from '@/modules/analysis/series.utils';
import { AsyncTtlCache } from '@/modules/analysis/async-ttl-cache';

import {
  ChainsAmountDto,
  ChainsCountLimitUpTimesQueryDto,
  ChainsUpgradeDto,
} from './chains.dto';

@Injectable()
export class ChainsService {
  private readonly queryCache = new AsyncTtlCache(5000);

  constructor(
    private limitService: SourceLimitService,
    private tradeCalService: SourceTradeCalService,
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

  private getCountTimes(
    params: Parameters<SourceLimitService['countTimes']>[0],
  ) {
    return this.queryCache.getOrCreate(
      `count-times:${JSON.stringify(params)}`,
      () => this.limitService.countTimes(params),
    );
  }

  /**
   * n连板数量统计
   */
  async countLimitUpTimes(dto: ChainsCountLimitUpTimesQueryDto) {
    const [countList, tradeDays] = await Promise.all([
      this.getCountTimes({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
        limitTimes: dto.limitTimes,
      }),
      this.getOpenTradeDays(dto.startDate, dto.endDate),
    ]);
    return applySeriesStates(
      fillCountSeries(tradeDays, countList),
      await readSeriesStates(this.db, tradeDays),
      ['count'],
    );
  }

  /**
   * n+连板数量统计
   */
  async countLimitUpAboveTimes(dto: ChainsCountLimitUpTimesQueryDto) {
    const [countList, tradeDays] = await Promise.all([
      this.limitService.countAboveTimes({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
        limitTimes: dto.limitTimes,
      }),
      this.getOpenTradeDays(dto.startDate, dto.endDate),
    ]);
    return applySeriesStates(
      fillCountSeries(tradeDays, countList),
      await readSeriesStates(this.db, tradeDays),
      ['count'],
    );
  }

  /**
   * 连板晋级成功率 连板数大于1
   */
  async upgradeLimitUps(dto: ChainsUpgradeDto) {
    // 获取每日 upgradeNum 连板数量
    const [upgradeNumList, tradeDays] = await Promise.all([
      this.getCountTimes({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
        limitTimes: dto.upgradeNum,
      }),
      this.getOpenTradeDays(dto.startDate, dto.endDate),
    ]);
    if (!tradeDays.length) return [];
    const prevStartDate = tradeDays[0].preTradeDate;
    if (!prevStartDate) {
      return applySeriesStates(
        calculateUpgradeRates(tradeDays, upgradeNumList, []),
        await readSeriesStates(this.db, tradeDays),
        ['rate'],
        tradeDays,
      );
    }
    // 获取每日 upgradeNum - 1 连板数量
    const upgradeNumMinusOneList = await this.getCountTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: prevStartDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.upgradeNum - 1,
    });
    return applySeriesStates(
      calculateUpgradeRates(tradeDays, upgradeNumList, upgradeNumMinusOneList),
      await readSeriesStates(this.db, tradeDays),
      ['rate'],
      tradeDays,
    );
  }

  /**
   * 连板晋级成功率 连板数等于1
   */
  async upgradeLimitUps1(dto: ChainsUpgradeDto) {
    const [upgradeNumZList, upgradeNumUList, tradeDays] = await Promise.all([
      this.getCountTimes({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.Z,
      }),
      this.getCountTimes({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
        limitTimes: dto.upgradeNum,
      }),
      this.getOpenTradeDays(dto.startDate, dto.endDate),
    ]);

    return applySeriesStates(
      calculateFirstUpgradeRates(tradeDays, upgradeNumUList, upgradeNumZList),
      await readSeriesStates(this.db, tradeDays),
      ['rate'],
    );
  }

  /**
   * 涨停参与金额
   */
  async limitUpAmount(dto: ChainsAmountDto) {
    const [limitUpAmountList, tradeDays] = await Promise.all([
      this.limitService.limitUpAmount({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
      }),
      this.getOpenTradeDays(dto.startDate, dto.endDate),
    ]);
    return applySeriesStates(
      fillAmountSeries(tradeDays, limitUpAmountList),
      await readSeriesStates(this.db, tradeDays),
      ['totalAmount'],
    );
  }

  /**
   * 连板参与金额
   */
  async upgradeLimitUpAmount(dto: ChainsAmountDto) {
    const [upgradeLimitUpAmountList, tradeDays] = await Promise.all([
      this.limitService.upgradeLimitUpAmount({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
      }),
      this.getOpenTradeDays(dto.startDate, dto.endDate),
    ]);
    return applySeriesStates(
      fillAmountSeries(tradeDays, upgradeLimitUpAmountList),
      await readSeriesStates(this.db, tradeDays),
      ['totalAmount'],
    );
  }
}
