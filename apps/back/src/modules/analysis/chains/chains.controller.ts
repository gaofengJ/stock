import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { LimitEntity } from '@/modules/source/limit/limit.entity';

import { ChainsService } from './chains.service';
import { ChainsCountDto, ChainsUpgradeDto } from './chains.dto';

@ApiTags('数据分析')
@Controller('chains')
export class ChainsController {
  constructor(private readonly chainsService: ChainsService) {}

  @Get('/count-limit-ups')
  @ApiOperation({ summary: 'n连板数量统计' })
  @ApiResult({ type: [LimitEntity], isPage: false })
  async countLimitUps(@Query() dto: ChainsCountDto) {
    const ret = await this.chainsService.countLimitUps(dto);
    return ret.items;
  }

  @Get('/upgrade-limit-ups')
  @ApiOperation({ summary: '连板统计' })
  @ApiResult({ type: [LimitEntity], isPage: false })
  async upgradeLimitUps(@Query() dto: ChainsUpgradeDto) {
    const ret = await this.chainsService.upgradeLimitUps(dto);
    return ret.items;
  }
}
