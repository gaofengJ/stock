import { Controller, Get, Logger } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';

import { ActiveFundsService } from './active-funds.service';
import { BasicActiveFundsEntity } from './active-funds.entity';

@ApiTags('基础数据')
@Controller('active-funds')
export class ActiveFundsController {
  private logger = new Logger(ActiveFundsController.name);

  constructor(private readonly activeFundsService: ActiveFundsService) {}

  @Get('/list')
  @ApiOperation({ summary: '游资名录' })
  @ApiResult({ type: [BasicActiveFundsEntity], isPage: false })
  async list() {
    this.logger.log(`Received request list with params`);

    const ret = await this.activeFundsService.list();
    return ret;
  }
}
