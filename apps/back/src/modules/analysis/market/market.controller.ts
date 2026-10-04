import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permit } from '@/modules/auth/permissions';
import { QueryTimeout } from '@/decorators/query-timeout.decorator';
import { MarketService } from './market.service';
import { MarketBreadthService } from './market-breadth.service';
import { DragonQueryDto, MarketQueryDto, ResearchQueryDto } from './market.dto';
import { SectorService } from './sector.service';
import { SectorQueryDto } from './sector.dto';
import { MarketResearchService } from './market-research.service';
import { InsightService } from '../../strategy/insight.service';
import { ExtremesDto } from '../../strategy/insight.dto';

@ApiTags('市场分析')
@Controller('market')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class MarketController {
  constructor(
    private service: MarketService,
    private breadthService: MarketBreadthService,
    private sectors: SectorService,
    private research: MarketResearchService,
    private insights: InsightService,
  ) {}

  @Get('extremes')
  @Permit('analysis:overview')
  extremes(@Query() q: ExtremesDto) {
    return this.insights.extremes(q.date, q.scope, q.period, q.days);
  }

  @Get('feedback')
  @Permit('analysis:senti')
  feedback(@Query() q: MarketQueryDto) {
    return this.research.feedback(q);
  }

  @Get('trajectories')
  @Permit('analysis:chains')
  trajectories(@Query() q: ResearchQueryDto) {
    return this.research.trajectories(q);
  }

  @Get('strategy-signals')
  @QueryTimeout(60000)
  @Permit('strategy:read')
  signals(@Query() q: ResearchQueryDto) {
    return this.research.signals(q);
  }

  @Get('candidate-environment')
  @Permit('strategy:read')
  environment(@Query() q: MarketQueryDto) {
    return this.research.environment(q);
  }

  @Get('status')
  @Permit(
    'analysis:overview',
    'analysis:senti',
    'analysis:limits',
    'analysis:chains',
    'analysis:dragon',
    'analysis:sectors',
  )
  @ApiOperation({ summary: '市场数据可用日期和同步阶段' })
  status() {
    return this.service.status();
  }

  @Get('sector-signals')
  @QueryTimeout(60000)
  @Permit('strategy:read')
  sectorSignals(@Query() q: MarketQueryDto) {
    return this.research.sectorSignals(q);
  }

  @Get('sectors')
  @Permit('analysis:sectors')
  sectorsBoard(@Query() q: SectorQueryDto) {
    return this.sectors.board(q);
  }

  @Get('sector-options')
  @Permit(
    'analysis:sectors',
    'analysis:limits',
    'analysis:chains',
    'analysis:dragon',
    'basic:stock',
    'strategy:read',
    'basic:daily',
  )
  sectorOptions() {
    return this.sectors.options();
  }

  @Get('overview')
  @Permit('analysis:overview')
  @ApiOperation({ summary: '大盘概览和指数趋势' })
  overview(@Query() q: MarketQueryDto) {
    return this.service.series(q);
  }

  @Get('breadth')
  @Permit('analysis:overview')
  @ApiOperation({ summary: '按市场范围统计复权均线广度' })
  breadth(@Query() q: MarketQueryDto) {
    return this.breadthService.series(q);
  }

  @Get('sentiment')
  @Permit('analysis:senti')
  @ApiOperation({ summary: '分市场情绪统计' })
  sentiment(@Query() q: MarketQueryDto) {
    return this.service.series(q);
  }

  @Get('chains')
  @Permit('analysis:chains')
  @ApiOperation({ summary: '连板历史统计' })
  chains(@Query() q: MarketQueryDto) {
    return this.service.series(q);
  }

  @Get('limits')
  @Permit('analysis:limits')
  @ApiOperation({ summary: '涨停跌停炸板明细' })
  limits(@Query() q: MarketQueryDto) {
    return this.service.limits(q);
  }

  @Get('ladder')
  @Permit('analysis:chains')
  @ApiOperation({ summary: '连板梯队与晋级去向' })
  ladder(@Query() q: MarketQueryDto) {
    return this.service.ladder(q);
  }

  @Get('dragon')
  @Permit('analysis:limits', 'analysis:dragon')
  @ApiOperation({ summary: '按需查询龙虎榜' })
  dragon(@Query() q: DragonQueryDto) {
    return this.service.dragon(q.date, q.code);
  }

  @Get('dragon-list')
  @Permit('analysis:limits', 'analysis:sectors', 'analysis:dragon')
  @ApiOperation({ summary: '当日龙虎榜上榜股票名单' })
  dragonList(@Query() q: MarketQueryDto) {
    return this.service.dragonList(q.date);
  }

  @Get('dragon-board')
  @Permit('analysis:dragon')
  @ApiOperation({ summary: '按统计范围查看当日龙虎榜，资金按上榜原因独立展示' })
  dragonBoard(@Query() q: MarketQueryDto) {
    return this.service.dragonBoard(q);
  }
}
