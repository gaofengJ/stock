import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';

import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';

import { TradeCalService } from './trade-cal.service';
import { BasicTradeCalQueryDto } from './trade-cal.dto';

@ApiTags('基础数据')
@Controller('trade-cal')
export class TradeCalController {
  private logger = new Logger(TradeCalController.name);

  constructor(private readonly tradeCalService: TradeCalService) {}

  @Get('/list')
  @ApiOperation({ summary: '交易日历' })
  @ApiResult({ type: [TradeCalEntity], isPage: false })
  async list(@Query() dto: BasicTradeCalQueryDto) {
    console.info('list', dto);
    const { year } = dto;
    this.logger.log(`Received request list with params`);

    const ret = await this.tradeCalService.list(year);
    return ret;
  }
}
