import { Injectable, Logger } from '@nestjs/common';

import { LimitQueryDto } from '@/modules/source/limit/limit.dto';
import { ELimit } from '@/modules/source/limit/limit.enum';
import { LimitService as SourceLimitService } from '@/modules/source/limit/limit.service';

@Injectable()
export class LimitsService {
  private logger = new Logger(LimitsService.name);

  constructor(private limitService: SourceLimitService) {}

  /**
   * 涨跌停统计
   */
  async limitUpList(tradeDate: LimitQueryDto['tradeDate']) {
    const ret = await this.limitService.list({
      pageNum: 1,
      pageSize: 10000,
      tradeDate,
      limit: ELimit.U,
    });
    ret.items.sort((a, b) => b.limitTimes - a.limitTimes);
    return ret;
  }
}
