import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { Permit } from '@/modules/auth/permissions';
import { QueryTimeout } from '@/decorators/query-timeout.decorator';
import { ReviewService } from './review.service';
import { HoldingsDto, ReviewDateDto } from './review.dto';

@Controller('review')
export class ReviewController {
  constructor(private service: ReviewService) {}

  @Get('report')
  @Permit('review:read')
  @QueryTimeout(180000)
  report(@Query() dto: ReviewDateDto) {
    return this.service.report(dto.date);
  }

  @Post('holdings')
  @Permit('review:read')
  @QueryTimeout(120000)
  @Header('Cache-Control', 'no-store')
  holdings(@Body() dto: HoldingsDto) {
    return this.service.holdings(dto);
  }
}
