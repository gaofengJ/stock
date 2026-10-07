import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { PageDto } from '../auth/auth.dto';

export class SyncJobDto {
  @IsDateString() startDate: string;

  @IsDateString() endDate: string;

  @IsOptional()
  @IsIn([
    'missing',
    'refresh',
    'breadth',
    'sector',
    'technical',
    'insights',
    'hot',
  ])
  mode:
    | 'missing'
    | 'refresh'
    | 'breadth'
    | 'sector'
    | 'technical'
    | 'insights'
    | 'hot' = 'missing';
}
export class LogsQueryDto extends PageDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9-]{36}$/) requestId?: string;

  @IsOptional() @IsIn(['issues', 'all']) view?: string;

  @IsOptional() @IsIn(['1']) refresh?: string;

  @IsOptional() @IsString() startDate?: string;

  @IsOptional() @IsString() endDate?: string;

  @IsOptional()
  @IsIn(['error', 'warn', 'info', 'debug', 'verbose'])
  level?: string;

  @IsOptional() @IsString() @Length(0, 100) module?: string;

  @IsOptional() @IsString() @Length(0, 64) user?: string;

  @IsOptional() @IsString() @Length(0, 64) action?: string;

  @IsOptional() @IsString() @Length(0, 24) result?: string;
}

export class AccessLogsQueryDto extends PageDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;

  @IsOptional() @IsString() @Length(0, 64) user?: string;

  @IsOptional() @IsIn(['user', 'guest', 'anonymous']) actorType?: string;

  @IsOptional() @IsString() @Length(0, 512) path?: string;

  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])
  method?: string;

  @IsOptional()
  @IsIn(['failed', 'success', 'client-error', 'server-error', 'aborted'])
  result?: string;

  @IsOptional() @IsIn(['1']) slow?: string;

  @IsOptional() @IsString() @Matches(/^[a-f0-9-]{36}$/) requestId?: string;
}

export class JobControlDto {
  @IsIn(['pause', 'cancel', 'retry']) action: 'pause' | 'cancel' | 'retry';
}

export class SyncJobsQueryDto extends PageDto {
  @IsOptional()
  @IsIn([
    'needs-attention',
    'source-wait',
    'auto-retry',
    'history',
    'recovered',
    'continued',
    'ignored',
  ])
  handling?: string;

  @IsOptional()
  @IsIn([
    'queued',
    'running',
    'success',
    'pending',
    'failed',
    'interrupted',
    'paused',
    'pausing',
    'cancelled',
    'cancelling',
    'dismissed',
  ])
  status?: string;

  @IsOptional()
  @IsIn([
    'missing',
    'refresh',
    'breadth',
    'sector',
    'technical',
    'insights',
    'hot',
  ])
  mode?: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startDate?: string;

  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
}
