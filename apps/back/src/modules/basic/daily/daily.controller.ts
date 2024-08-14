import * as dayjs from 'dayjs';

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';

import { DailyQueryDto } from '@/modules/source/daily/daily.dto';
import { DailyEntity } from '@/modules/source/daily/daily.entity';

import { DailyService } from './daily.service';

@ApiTags('基础数据')
@Controller('daily')
export class DailyController {
  constructor(private readonly dailyService: DailyService) {}

  @Get('/list')
  @ApiOperation({ summary: '每日交易数据' })
  @ApiResult({ type: [DailyEntity], isPage: true })
  async daily(@Query() dto: DailyQueryDto) {
    const { tradeDate } = dto;
    const formatedTradeDate = dayjs(tradeDate).format('YYYY-MM-DD');
    const ret = await this.dailyService.daily({
      ...dto,
      tradeDate: formatedTradeDate,
    });
    return ret;
  }
}