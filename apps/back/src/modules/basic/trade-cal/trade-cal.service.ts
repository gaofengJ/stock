import { Injectable, Logger } from '@nestjs/common';

import { TradeCalService as SourceTradeCalService } from '@/modules/source/trade-cal/trade-cal.service';

import { BasicTradeCalQueryDto } from './trade-cal.dto';

@Injectable()
export class TradeCalService {
  private logger = new Logger(TradeCalService.name);

  constructor(private tradeCalService: SourceTradeCalService) {}

  /**
   * 交易日历
   */
  async list(year: BasicTradeCalQueryDto['year']) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const ret = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 10000,
      startDate,
      endDate,
    });
    return ret.items;
  }
}
