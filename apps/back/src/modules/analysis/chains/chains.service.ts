import { Injectable, Logger } from '@nestjs/common';
import { LimitService as SourceLimitService } from '@/modules/source/limit/limit.service';
import { ELimit } from '@/modules/source/limit/limit.enum';
import { ChainsCountDto, ChainsUpgradeDto } from './chains.dto';

@Injectable()
export class ChainsService {
  private logger = new Logger(ChainsService.name);

  constructor(private limitService: SourceLimitService) {}

  /**
   * 涨跌停统计
   */
  async countLimitUps(dto: ChainsCountDto) {
    const ret = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
    });
    ret.items.sort((a, b) => b.limitTimes - a.limitTimes);
    return ret;
  }

  /**
   * 涨跌停统计
   */
  async upgradeLimitUps(dto: ChainsUpgradeDto) {
    const ret = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate: dto.startDate,
      endDate: dto.endDate,
      limit: ELimit.U,
    });
    ret.items.sort((a, b) => b.limitTimes - a.limitTimes);
    return ret;
  }
}
