import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';

import { ChainsService } from './chains.service';
import {
  ChainsCountLimitUpTimesQueryDto,
  ChainsUpgradeDto,
} from './chains.dto';
import {
  ChainsCountLimitUpTimesEntity,
  ChainsUpgradeLimitUpRatesEntity,
} from './chains.entity';

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

  @Get('/count-limit-up-above-times')
  @ApiOperation({ summary: 'n+连板数量统计' })
  @ApiResult({ type: [ChainsCountLimitUpTimesEntity], isPage: false })
  async countLimitUpAboveTimes(@Query() dto: ChainsCountLimitUpTimesQueryDto) {
    const ret = await this.chainsService.countLimitUpAboveTimes(dto);
    return ret;
  }

  @Get('/upgrade-limit-up-rates')
  @ApiOperation({ summary: '连板晋级成功率' })
  @ApiResult({ type: [ChainsUpgradeLimitUpRatesEntity], isPage: false })
  async upgradeLimitUps(@Query() dto: ChainsUpgradeDto) {
    // 连板数为 1 特殊处理
    if (dto.upgradeNum === 1) {
      const ret = await this.chainsService.upgradeLimitUps1(dto);
      return ret;
    }
    // 连板数大于 1
    const ret = await this.chainsService.upgradeLimitUps(dto);
    return ret;
  }
}
