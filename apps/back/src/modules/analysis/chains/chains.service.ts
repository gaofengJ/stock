import { Injectable } from '@nestjs/common';
import { LimitService as SourceLimitService } from '@/modules/source/limit/limit.service';
import { TradeCalService as SourceTradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { ELimit } from '@/modules/source/limit/limit.enum';
import { EIsOpen } from '@/modules/source/trade-cal/trade-cal.enum';

import {
  ChainsAmountDto,
  ChainsCountLimitUpTimesQueryDto,
  ChainsUpgradeDto,
} from './chains.dto';

@Injectable()
export class ChainsService {
  constructor(
    private limitService: SourceLimitService,
    private tradeCalService: SourceTradeCalService,
  ) {}

  /**
   * n连板数量统计
   */
  async countLimitUpTimes(dto: ChainsCountLimitUpTimesQueryDto) {
    const countList = await this.limitService.countTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.limitTimes,
    });
    return countList;
  }

  /**
   * n+连板数量统计
   */
  async countLimitUpAboveTimes(dto: ChainsCountLimitUpTimesQueryDto) {
    const countList = await this.limitService.countAboveTimes({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
      limitTimes: dto.limitTimes,
    });
    return countList;
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
    const dateArr = items.map((i) => i.calDate);

    // 使用 Map 优化查找性能
    const upgradeNumMap = new Map(
      upgradeNumList.map((item) => [item.tradeDate, item.count]),
    );

    // 需要获取前一个交易日的 map，因为分母是前一日的连板数
    // 但是这里 upgradeNumMinusOneList 的日期范围是从 prevStartDate 开始的
    // upgradeNumMinusOneList[0] 对应 prevStartDate
    // upgradeNumMinusOneList[1] 对应 items[0].calDate

    // 重新构建 upgradeNumMinusOneList 的索引以便直接按当前日期查找前一日数据
    // 实际上 upgradeNumMinusOneList 的数据已经是按时间顺序排列的
    // upgradeNumMinusOneList[i] 就是 dateArr[i] 的前一交易日的数据

    for (let i = 0; i < dateArr.length; i += 1) {
      const num = upgradeNumMap.get(dateArr[i]) || 0;
      // upgradeNumMinusOneList 的第 i 个元素对应的是 dateArr[i] 的前一个交易日的数据
      // 因为 upgradeNumMinusOneList 是从 prevStartDate 开始查的
      const denom = upgradeNumMinusOneList[i]?.count || 0;

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

    // 使用 Map 优化查找性能
    const upgradeNumZMap = new Map(
      upgradeNumZList.map((item) => [item.tradeDate, item.count]),
    );
    const upgradeNumUMap = new Map(
      upgradeNumUList.map((item) => [item.tradeDate, item.count]),
    );

    // 获取所有涉及的日期并去重排序，确保覆盖所有有数据的日期
    const allDates = new Set([
      ...upgradeNumZMap.keys(),
      ...upgradeNumUMap.keys(),
    ]);
    const dateArr = Array.from(allDates).sort();

    const ret = [];
    for (let i = 0; i < dateArr.length; i += 1) {
      const numZ = upgradeNumZMap.get(dateArr[i]) || 0;
      const numU = upgradeNumUMap.get(dateArr[i]) || 0;
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
    const limitUpAmountList = await this.limitService.limitUpAmount({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
    });
    return limitUpAmountList;
  }

  /**
   * 连板参与金额
   */
  async upgradeLimitUpAmount(dto: ChainsAmountDto) {
    const upgradeLimitUpAmountList =
      await this.limitService.upgradeLimitUpAmount({
        pageNum: 1,
        pageSize: 10000,
        startDate: dto.startDate,
        endDate: dto.endDate,
        limit: ELimit.U,
      });
    return upgradeLimitUpAmountList;
  }
}
