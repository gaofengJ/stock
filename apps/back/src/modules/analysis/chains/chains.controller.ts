import { Controller, Get, Logger, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';

import { ChainsService } from './chains.service';
import {
  ChainsAmountDto,
  ChainsCountLimitUpTimesQueryDto,
  ChainsUpgradeDto,
} from './chains.dto';
import {
  ChainsCountLimitUpTimesEntity,
  ChainsLimitUpAmountEntity,
  ChainsUpgradeLimitUpRatesEntity,
} from './chains.entity';

@ApiTags('数据分析')
@Controller('chains')
export class ChainsController {
  private logger = new Logger(ChainsController.name);

  constructor(private readonly chainsService: ChainsService) {}

  @Get('/count-limit-up-times')
  @ApiOperation({ summary: 'n连板数量统计' })
  @ApiResult({ type: [ChainsCountLimitUpTimesEntity], isPage: false })
  async countLimitUpTimes(@Query() dto: ChainsCountLimitUpTimesQueryDto) {
    this.logger.log(
      `Received request countLimitUpTimes with params: ${JSON.stringify(dto)}`,
    );

    const ret = await this.chainsService.countLimitUpTimes(dto);
    return ret;
  }

  @Get('/count-limit-up-above-times')
  @ApiOperation({ summary: 'n+连板数量统计' })
  @ApiResult({ type: [ChainsCountLimitUpTimesEntity], isPage: false })
  async countLimitUpAboveTimes(@Query() dto: ChainsCountLimitUpTimesQueryDto) {
    this.logger.log(
      `Received request countLimitUpAboveTimes with params: ${JSON.stringify(
        dto,
      )}`,
    );

    const ret = await this.chainsService.countLimitUpAboveTimes(dto);
    return ret;
  }

  @Get('/upgrade-limit-up-rates')
  @ApiOperation({ summary: 'n连板晋级成功率' })
  @ApiResult({ type: [ChainsUpgradeLimitUpRatesEntity], isPage: false })
  async upgradeLimitUps(@Query() dto: ChainsUpgradeDto) {
    this.logger.log(
      `Received request upgradeLimitUps with params: ${JSON.stringify(dto)}`,
    );

    // 连板数为 1 特殊处理
    if (dto.upgradeNum === 1) {
      const ret = await this.chainsService.upgradeLimitUps1(dto);
      return ret;
    }
    // 连板数大于 1
    const ret = await this.chainsService.upgradeLimitUps(dto);
    return ret;
  }

  @Get('/limit-up-amount')
  @ApiOperation({ summary: '涨停参与金额' })
  @ApiResult({ type: [ChainsLimitUpAmountEntity], isPage: false })
  async limitUpAmount(@Query() dto: ChainsAmountDto) {
    this.logger.log(
      `Received request limitUpAmount with params: ${JSON.stringify(dto)}`,
    );

    const ret = await this.chainsService.limitUpAmount(dto);
    return ret;
  }

  @Get('/upgrade-limit-up-amount')
  @ApiOperation({ summary: '连板参与金额' })
  @ApiResult({ type: [ChainsLimitUpAmountEntity], isPage: false })
  async upgradeLimitUpAmount(@Query() dto: ChainsAmountDto) {
    this.logger.log(
      `Received request upgradeLimitUpAmount with params: ${JSON.stringify(
        dto,
      )}`,
    );

    const ret = await this.chainsService.upgradeLimitUpAmount(dto);
    return ret;
  }
}
