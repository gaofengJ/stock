import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { LimitEntity } from '@/modules/source/limit/limit.entity';

import { ChainsService } from './chains.service';
import {
  ChainsCountLimitUpTimesQueryDto,
  ChainsUpgradeDto,
} from './chains.dto';
import { ChainsCountLimitUpTimesEntity } from './chains.entity';

@ApiTags('数据分析')
@Controller('chains')
export class ChainsController {
  constructor(private readonly chainsService: ChainsService) {}

  @Get('/count-limit-up-times')
  @ApiOperation({ summary: 'n连板数量统计' })
  @ApiResult({ type: [ChainsCountLimitUpTimesEntity], isPage: false })
  async countLimitUpTimes(@Query() dto: ChainsCountLimitUpTimesQueryDto) {
    const ret = await this.chainsService.countLimitUpTimes(dto);
    return ret;
  }

  @Get('/upgrade-limit-ups')
  @ApiOperation({ summary: '连板统计' })
  @ApiResult({ type: [LimitEntity], isPage: false })
  async upgradeLimitUps(@Query() dto: ChainsUpgradeDto) {
    const ret = await this.chainsService.upgradeLimitUps(dto);
    return ret.items;
  }
}
