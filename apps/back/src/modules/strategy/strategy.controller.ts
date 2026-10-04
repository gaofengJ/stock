import { Permit } from '@/modules/auth/permissions';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResult } from '@/decorators/api-result.decorator';
import { QueryTimeout } from '@/decorators/query-timeout.decorator';

import { StrategyService } from './strategy.service';
import { TabItem } from './strategy.entity';
import { StrategyListQueryDto, StrategyChartQueryDto } from './strategy.dto';
import { DailyEntity } from '../source/daily/daily.entity';
import { InsightService } from './insight.service';
import { InsightDateDto, PerformanceDto } from './insight.dto';

@ApiTags('策略选股')
@Controller('strategy')
export class StrategyController {
  constructor(
    private readonly strategyService: StrategyService,
    private insights: InsightService,
  ) {}

  @Permit('strategy:read')
  @Get('/comparison')
  comparison(@Query() q: InsightDateDto) {
    return this.insights.comparison(q.date);
  }

  @Permit('strategy:read')
  @Get('/performance')
  @QueryTimeout(60000)
  performance(@Query() q: PerformanceDto) {
    return this.insights.performance(q.date, q.strategyType, q.days, q.sector);
  }

  @Permit('strategy:read')
  @Get('/popularity')
  popularity(@Query() q: InsightDateDto) {
    return this.insights.popularity(q.date);
  }

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
  @QueryTimeout(60000)
  @ApiOperation({ summary: '策略选股结果列表' })
  @ApiResult({ type: [DailyEntity] })
  list(@Query() dto: StrategyListQueryDto) {
    const ret = this.strategyService.list(dto);
    return ret;
  }

  @Permit('strategy:read', 'basic:stock', 'review:read')
  @Get('/chart')
  @QueryTimeout(60000)
  @ApiOperation({ summary: '选股信号对应的个股日K与成交量' })
  chart(@Query() dto: StrategyChartQueryDto) {
    return this.strategyService.chart(dto);
  }
}
