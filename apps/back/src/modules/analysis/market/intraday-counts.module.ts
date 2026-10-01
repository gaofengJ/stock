import {
  Controller,
  Get,
  Module,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permit } from '@/modules/auth/permissions';
import { IntradayCountsQueryDto } from './intraday-counts.dto';
import { IntradayCountsService } from './intraday-counts.service';

@ApiTags('市场分析')
@Controller('market')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class IntradayCountsController {
  constructor(private readonly service: IntradayCountsService) {}

  @Get('intraday-counts')
  @Permit('analysis:senti')
  @ApiOperation({ summary: '财联社全市场盘中涨跌家数，最多保留30个交易日' })
  series(@Query() query: IntradayCountsQueryDto) {
    return this.service.series(query);
  }
}

@Module({
  controllers: [IntradayCountsController],
  providers: [IntradayCountsService],
})
export class IntradayCountsModule {}
