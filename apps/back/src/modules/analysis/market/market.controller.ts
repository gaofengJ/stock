import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permit } from '@/modules/auth/permissions';
import { MarketService } from './market.service';
import { DragonQueryDto, MarketQueryDto } from './market.dto';

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
  constructor(private service: MarketService) {}

  @Get('status')
  @Permit(
    'analysis:overview',
    'analysis:senti',
    'analysis:limits',
    'analysis:chains',
  )
  @ApiOperation({ summary: '市场数据可用日期和同步阶段' })
  status() {
    return this.service.status();
  }

  @Get('overview')
  @Permit('analysis:overview')
  @ApiOperation({ summary: '大盘概览和指数趋势' })
  overview(@Query() q: MarketQueryDto) {
    return this.service.series(q);
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
  @Permit('analysis:limits')
  @ApiOperation({ summary: '按需查询龙虎榜' })
  dragon(@Query() q: DragonQueryDto) {
    return this.service.dragon(q.date, q.code);
  }

  @Get('dragon-list')
  @Permit('analysis:limits')
  @ApiOperation({ summary: '当日龙虎榜上榜股票名单' })
  dragonList(@Query() q: MarketQueryDto) {
    return this.service.dragonList(q.date);
  }
}
