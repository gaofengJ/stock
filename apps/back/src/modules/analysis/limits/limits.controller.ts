import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { CommonDateDto } from '@/dto/common.dto';

import { LimitsService } from './limits.service';

@ApiTags('数据分析')
@Controller('limits')
export class LimitsController {
  constructor(private readonly limitsService: LimitsService) {}

  @Get('/limit-up-list')
  @ApiOperation({ summary: '涨停板复盘' })
  @ApiResult({ type: [LimitEntity], isPage: false })
  async limitUpList(@Query() dto: CommonDateDto) {
    const { date } = dto;
    const ret = await this.limitsService.limitUpList(date);
    return ret;
  }
}
