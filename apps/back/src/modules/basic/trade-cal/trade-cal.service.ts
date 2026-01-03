import { Injectable } from '@nestjs/common';
import { TradeCalService as SourceTradeCalService } from '@/modules/source/trade-cal/trade-cal.service';
import { BasicTradeCalQueryDto } from './trade-cal.dto';

@Injectable()
export class TradeCalService {
  constructor(private tradeCalService: SourceTradeCalService) {}

  /**
   * 交易日历
   */
  async list(year: BasicTradeCalQueryDto['year']) {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    // 修改为直接查询全部数据，不分页，避免 limit 10000 的潜在限制（虽然一年只有365天）
    // 但此处使用 sourceTradeCalService.list 是分页的，我们需要确保它能返回所有数据
    // 或者直接调用 sourceTradeCalService 的 repository 方法如果可以访问的话
    // 由于 sourceTradeCalService.list 内部实现了分页，这里我们保留分页参数但确保足够大
    const ret = await this.tradeCalService.list({
      pageNum: 1,
      pageSize: 366, // 一年最多366天
      startDate,
      endDate,
    });
    return ret.items;
  }
}
