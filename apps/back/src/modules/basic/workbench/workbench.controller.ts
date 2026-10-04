import { Controller, Get, Query } from '@nestjs/common';
import { Permit } from '@/modules/auth/permissions';
import { WorkbenchService } from './workbench.service';
import { WorkbenchQuery } from './workbench.dto';

@Controller('workbench')
export class WorkbenchController {
  constructor(private service: WorkbenchService) {}

  @Get('profile') @Permit('basic:stock') profile(@Query() dto: WorkbenchQuery) {
    return this.service.profile(dto);
  }

  @Get('risk')
  @Permit('basic:stock', 'basic:daily', 'strategy:read', 'analysis:limits')
  risk(@Query() dto: WorkbenchQuery) {
    return this.service.risk(dto);
  }

  @Get('events') @Permit('basic:calendar') events(
    @Query() dto: WorkbenchQuery,
  ) {
    return this.service.events(dto);
  }

  @Get('seat') @Permit('basic:funds', 'analysis:dragon') seat(
    @Query() dto: WorkbenchQuery,
  ) {
    return this.service.seat(dto);
  }
}
