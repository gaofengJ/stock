import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as dayjs from 'dayjs';

import { ApiResult } from '@/decorators/api-result.decorator';
import { DailyQueryDto } from '@/modules/source/daily/daily.dto';
import { DailyEntity } from '@/modules/source/daily/daily.entity';

import { DailyService } from './daily.service';

@ApiTags('基础数据')
@Controller('daily')
export class DailyController {
  private logger = new Logger(DailyController.name);

  constructor(private readonly dailyService: DailyService) {}

  @Get('/list')
  @ApiOperation({ summary: '每日交易数据' })
  @ApiResult({ type: [DailyEntity], isPage: true })
  async list(@Query() dto: DailyQueryDto) {
    this.logger.log(
      `Received request list with params: ${JSON.stringify(dto)}`,
    );

    const { tradeDate } = dto;
    const formatedTradeDate = dayjs(tradeDate).format('YYYY-MM-DD');
    const ret = await this.dailyService.daily({
      ...dto,
      tradeDate: formatedTradeDate,
    });
    return ret;
  }
}
