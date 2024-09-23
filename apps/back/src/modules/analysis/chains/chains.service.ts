import { Injectable, Logger } from '@nestjs/common';

import { ELimit } from '@/modules/source/limit/limit.enum';
import { LimitService as SourceLimitService } from '@/modules/source/limit/limit.service';
import { EIsOpen } from '@/modules/source/trade-cal/trade-cal.enum';
import { TradeCalService as SourceTradeCalService } from '@/modules/source/trade-cal/trade-cal.service';

import {
  ChainsAmountDto,
  ChainsCountLimitUpTimesQueryDto,
  ChainsUpgradeDto,
} from './chains.dto';

@Injectable()
export class ChainsService {
  private logger = new Logger(ChainsService.name);

  constructor(
    private limitService: SourceLimitService,
    private tradeCalService: SourceTradeCalService,
  ) {}

  /**
   * n连板数量统计
   */
  async countLimitUpTimes(dto: ChainsCountLimitUpTimesQueryDto) {
    const { items } = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isOpen: EIsOpen.OPENED,
    });
    // 获取时间范围
    const dateArr = items.map((i) => i.calDate);

    const countList = await this.limitService.countTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.limitTimes,
    });

    const ret = [];
    for (let i = 0; i < dateArr.length; i += 1) {
      const count =
        countList.find((j) => j.tradeDate === dateArr[i])?.count || 0;
      ret.push({
        tradeDate: dateArr[i],
        count,
      });
    }
    return ret;
  }

  /**
   * n+连板数量统计
   */
  async countLimitUpAboveTimes(dto: ChainsCountLimitUpTimesQueryDto) {
    const { items } = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isOpen: EIsOpen.OPENED,
    });
    // 获取时间范围
    const dateArr = items.map((i) => i.calDate);

    const countList = await this.limitService.countAboveTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.limitTimes,
    });

    const ret = [];
    for (let i = 0; i < dateArr.length; i += 1) {
      const count =
        countList.find((j) => j.tradeDate === dateArr[i])?.count || 0;
      ret.push({
        tradeDate: dateArr[i],
        count,
      });
    }
    return ret;
  }

  /**
   * 连板晋级成功率 连板数大于1
   */
  async upgradeLimitUps(dto: ChainsUpgradeDto) {
    // 获取每日 upgradeNum 连板数量
    const upgradeNumList = await this.limitService.countTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.upgradeNum,
    });
    const { items } = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isOpen: EIsOpen.OPENED,
    });
    if (!items.length) return [];
    const prevStartDate = items[0].preTradeDate;
    // 获取时间范围，并将 prevStartDate 拼到前面
    const dateArr = [prevStartDate, ...items.map((i) => i.calDate)];
    // 获取每日 upgradeNum - 1 连板数量
    const upgradeNumMinusOneList = await this.limitService.countTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: prevStartDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.upgradeNum - 1,
    });
    // 取出最后一条，使其 length 和 upgradeNumMinusOneList 相等
    upgradeNumMinusOneList.pop();

    const ret = [];
    for (let i = 1; i < dateArr.length; i += 1) {
      const num =
        upgradeNumList.find((j) => j.tradeDate === dateArr[i])?.count || 0;
      const denom =
        upgradeNumMinusOneList.find((j) => j.tradeDate === dateArr[i - 1])
          ?.count || 0;
      ret.push({
        tradeDate: dateArr[i],
        // 如果分子或者分母为 0，直接返回 0
        rate: !num || !denom ? 0 : Math.round(num / denom / 0.01),
      });
    }
    return ret;
  }

  /**
   * 连板晋级成功率 连板数等于1
   */
  async upgradeLimitUps1(dto: ChainsUpgradeDto) {
    const upgradeNumZList = await this.limitService.countTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.Z,
    });
    const upgradeNumUList = await this.limitService.countTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.upgradeNum,
    });
    const { items } = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isOpen: EIsOpen.OPENED,
    });
    // 获取时间范围
    const dateArr = items.map((i) => i.calDate);
    const ret = [];
    for (let i = 0; i < dateArr.length; i += 1) {
      const numZ =
        upgradeNumZList.find((j) => j.tradeDate === dateArr[i])?.count || 0;
      const numU =
        upgradeNumUList.find((j) => j.tradeDate === dateArr[i])?.count || 0;
      ret.push({
        tradeDate: dateArr[i],
        // 如果涨停数为 0，直接返回 0
        rate: !numU ? 0 : Math.round(numU / (numU + numZ) / 0.01),
      });
    }
    return ret;
  }

  /**
   * 涨停参与金额
   */
  async limitUpAmount(dto: ChainsAmountDto) {
    const { items } = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isOpen: EIsOpen.OPENED,
    });
    // 获取时间范围
    const dateArr = items.map((i) => i.calDate);

    const limitUpAmountList = await this.limitService.limitUpAmount({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
    });

    const ret = [];
    for (let i = 0; i < dateArr.length; i += 1) {
      const totalAmount =
        limitUpAmountList.find((j) => j.tradeDate === dateArr[i])
          ?.totalAmount || 0;
      ret.push({
        tradeDate: dateArr[i],
        totalAmount,
      });
    }

    return ret;
  }

  /**
   * 连板参与金额
   */
  async upgradeLimitUpAmount(dto: ChainsAmountDto) {
    const { items } = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      isOpen: EIsOpen.OPENED,
    });
    // 获取时间范围
    const dateArr = items.map((i) => i.calDate);

    const upgradeLimitUpAmountList =
      await this.limitService.upgradeLimitUpAmount({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
      });

    const ret = [];
    for (let i = 0; i < dateArr.length; i += 1) {
      const totalAmount =
        upgradeLimitUpAmountList.find((j) => j.tradeDate === dateArr[i])
          ?.totalAmount || 0;
      ret.push({
        tradeDate: dateArr[i],
        totalAmount,
      });
    }
    return ret;
  }
}
