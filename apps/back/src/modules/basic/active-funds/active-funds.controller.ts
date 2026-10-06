import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';
import { Permit } from '../../auth/permissions';

import { ActiveFundsService } from './active-funds.service';
import { BasicActiveFundsEntity } from './active-funds.entity';

@ApiTags('基础数据')
@Controller('active-funds')
export class ActiveFundsController {
  constructor(private readonly activeFundsService: ActiveFundsService) {}

  @Get('/list')
  @Permit('basic:funds')
  @ApiOperation({ summary: '游资名录' })
  @ApiResult({ type: [BasicActiveFundsEntity], isPage: false })
  async list() {
    const ret = await this.activeFundsService.list();
    return ret;
  }
}
