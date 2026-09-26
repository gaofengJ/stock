import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Permit } from '../auth/permissions';
import { AuthRequest } from '../auth/auth.service';
import { PageDto } from '../auth/auth.dto';
import { JobsService } from './jobs.service';
import { LogsService } from './logs.service';
import { LogsQueryDto, SyncJobDto } from './admin.dto';

@Controller('admin')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AdminController {
  constructor(
    private jobs: JobsService,
    private logs: LogsService,
  ) {}

  @Permit('sync:run')
  @Post('sync-jobs')
  @HttpCode(202)
  create(@Req() req: AuthRequest, @Body() dto: SyncJobDto) {
    return this.jobs.create(req.authUser!, dto.startDate, dto.endDate);
  }

  @Permit('sync:read')
  @Get('sync-jobs')
  list(@Query() q: PageDto) {
    return this.jobs.list(q);
  }

  @Permit('sync:read')
  @Get('sync-jobs/:id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.jobs.detail(id);
  }

  @Permit('logs:read')
  @Get('logs')
  applications(@Query() q: LogsQueryDto) {
    return this.logs.application(q);
  }

  @Permit('logs:read')
  @Get('audit-logs')
  audit(@Query() q: LogsQueryDto) {
    return this.logs.audit(q);
  }

  @Permit('logs:read')
  @Get('stats')
  stats(@Query() q: LogsQueryDto) {
    return this.logs.stats(q);
  }
}
