import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import * as dayjs from 'dayjs';

import { BasicService } from './basic.service';
import { DailyQueryDto } from '../source/daily/daily.dto';
import { StockQueryDto } from '../source/stock/stock.dto';

@ApiTags('基础数据')
@Controller('basic')
export class BasicController {
  constructor(private readonly basicService: BasicService) {}

  @Get('/daily')
  @ApiOperation({ summary: '每日交易数据' })
  async daily(@Query() dto: DailyQueryDto) {
    const { pageNum, pageSize, tradeDate } = dto;
    const formatedTradeDate = dayjs(tradeDate).format('YYYY-MM-DD');
    const ret = await this.basicService.daily({
      pageNum,
      pageSize,
      tradeDate: formatedTradeDate,
    });
    return ret;
  }

  @Get('/stock')
  @ApiOperation({ summary: '每日交易数据' })
  async stock(@Query() dto: StockQueryDto) {
    const { pageNum, pageSize } = dto;
    const ret = await this.basicService.stock({
      pageNum,
      pageSize,
    });
    return ret;
  }
}
