import { Controller, Get, Query } from '@nestjs/common';
import { Permit } from '@/modules/auth/permissions';
import { Throttle } from '@nestjs/throttler';
import { readThrottleTracker } from '@/modules/auth/read-throttle-tracker';
import { WorkbenchService } from './workbench.service';
import { WorkbenchQuery } from './workbench.dto';

@Controller('workbench')
export class WorkbenchController {
  constructor(private service: WorkbenchService) {}

  @Get('profile') @Permit('basic:stock') profile(@Query() dto: WorkbenchQuery) {
    return this.service.profile(dto);
  }

  @Get('risk')
  // Lists, stock previews and background polls share this read endpoint.
  @Throttle({
    default: { limit: 30, ttl: 10000, getTracker: readThrottleTracker },
  })
  @Permit(
    'basic:stock',
    'basic:daily',
    'strategy:read',
    'analysis:limits',
    'review:read',
  )
  risk(@Query() dto: WorkbenchQuery) {
    return this.service.risk(dto);
  }

  @Get('risk-detail')
  @Throttle({
    default: { limit: 30, ttl: 10000, getTracker: readThrottleTracker },
  })
  @Permit(
    'basic:stock',
    'basic:daily',
    'strategy:read',
    'analysis:limits',
    'review:read',
  )
  riskDetail(@Query() dto: WorkbenchQuery) {
    return this.service.riskDetail(dto);
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

  @Get('market-events') @Permit('basic:calendar') marketEvents(
    @Query() dto: WorkbenchQuery,
  ) {
    return this.service.marketEvents(dto);
  }
}
