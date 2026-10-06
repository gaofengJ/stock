import { Controller, Get, Query } from '@nestjs/common';
import { Permit } from '@/modules/auth/permissions';
import { ResearchService } from './research.service';
import { MarketResearchQuery, ResearchQuery } from './research.dto';

@Controller('workbench/research')
export class ResearchController {
  constructor(private service: ResearchService) {}

  @Get('stock') @Permit('basic:stock') stock(@Query() dto: ResearchQuery) {
    return this.service.stock(dto);
  }

  @Get('sectors') @Permit('analysis:sectors') sectors(
    @Query() dto: MarketResearchQuery,
  ) {
    return this.service.sectors(dto);
  }

  @Get('market') @Permit('analysis:overview') market(
    @Query() dto: MarketResearchQuery,
  ) {
    return this.service.market(dto);
  }
}
