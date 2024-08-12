import { Injectable, Logger } from '@nestjs/common';
import { StockService as SourceStockService } from '@/modules/source/stock/stock.service';
import { StockQueryDto } from '@/modules/source/stock/stock.dto';

@Injectable()
export class StockService {
  private logger = new Logger(StockService.name);

  constructor(private stockService: SourceStockService) {}

  /**
   * 股票基本信息表
   */
  async stock(dto: StockQueryDto) {
    const ret = await this.stockService.list(dto);
    return ret;
  }
}
