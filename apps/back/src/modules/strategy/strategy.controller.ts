import { Permit } from '@/modules/auth/permissions';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';

import { StrategyService } from './strategy.service';
import { TabItem } from './strategy.entity';
import { StrategyListQueryDto } from './strategy.dto';
import { DailyEntity } from '../source/daily/daily.entity';

@ApiTags('策略选股')
@Controller('strategy')
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

  @Permit('strategy:read')
  @Get('/tabs-list')
  @ApiOperation({ summary: '策略名称列表' })
  @ApiResult({ type: [TabItem] })
  tabsList() {
    const ret = this.strategyService.navList();
    return ret;
  }

  @Permit('strategy:read')
  @Get('/list')
  @ApiOperation({ summary: '策略选股结果列表' })
  @ApiResult({ type: [DailyEntity] })
  list(@Query() dto: StrategyListQueryDto) {
    const ret = this.strategyService.list(dto);
    return ret;
  }
}
