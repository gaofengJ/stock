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
import { JobsService } from './jobs.service';
import { LogsService } from './logs.service';
import {
  JobControlDto,
  LogsQueryDto,
  SyncJobDto,
  SyncJobsQueryDto,
} from './admin.dto';

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
    return this.jobs.create(
      req.authUser!,
      dto.startDate,
      dto.endDate,
      dto.mode,
    );
  }

  @Permit('sync:read')
  @Get('sync-jobs')
  list(@Query() q: SyncJobsQueryDto) {
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

  @Permit('sync:run')
  @Post('sync-jobs/:id/control')
  control(
    @Req() req: AuthRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: JobControlDto,
  ) {
    return this.jobs.control(req.authUser!, id, dto.action);
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
