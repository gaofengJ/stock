import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { Permit } from '@/modules/auth/permissions';
import { MarketQueryDto } from './market.dto';
import { ThemeReviewService } from './theme-review.service';

export class ThemeReviewDetailQuery extends MarketQueryDto {
  @Matches(/^\d{6}\.(SH|SZ|BJ)$/) code: string;
}

@ApiTags('市场分析')
@Controller('market')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ThemeReviewController {
  constructor(private review: ThemeReviewService) {}

  @Get('theme-review')
  @Permit('analysis:limits')
  @ApiOperation({ summary: '按当日题材分组的涨停复盘' })
  board(@Query() q: MarketQueryDto) {
    return this.review.board(q);
  }

  @Get('theme-review-detail')
  @Permit('analysis:limits')
  @ApiOperation({ summary: '涨停原因与截至复盘日已披露的公告、业绩资料' })
  detail(@Query() q: ThemeReviewDetailQuery) {
    return this.review.detail(q, q.code);
  }
}
