import { Injectable, Logger } from '@nestjs/common';
import { DailyService } from '@/modules/source/daily/daily.service';
import { DailyQueryDto } from '../source/daily/daily.dto';
import { StockService } from '../source/stock/stock.service';
import { StockQueryDto } from '../source/stock/stock.dto';

@Injectable()
export class BasicService {
  private logger = new Logger(BasicService.name);

  constructor(
    private stockService: StockService,
    private dailyService: DailyService,
  ) {}

  /**
   * 每日数据
   * @param date
   */
  async daily(dto: DailyQueryDto) {
    const ret = await this.dailyService.list(dto);
    return ret;
  }

  /**
   * 股票基本信息表
   */
  async stock(dto: StockQueryDto) {
    const ret = await this.stockService.list(dto);
    return ret;
  }
}
