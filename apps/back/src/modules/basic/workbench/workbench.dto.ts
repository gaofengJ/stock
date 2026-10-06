import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class WorkbenchQuery {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional() @Matches(/^\d{6}\.(SH|SZ|BJ)$/) code?: string;

  @IsOptional() @IsIn(['overview', 'financial']) section?: string;

  @IsOptional() @Matches(/^88[156]\d{3}\.TI$/) sector?: string;

  @IsOptional() @IsString() @MaxLength(256) org?: string;

  @IsOptional() @IsIn(['7', '30']) days?: string;

  @IsOptional() @IsString() @MaxLength(64) keyword?: string;

  @IsOptional() @Matches(/^[1-9]\d{0,5}$/) page?: string;

  @IsOptional() @Matches(/^([1-9]|[1-4]\d|50)$/) pageSize?: string;

  @IsOptional()
  @IsIn(['解禁', '财报披露', '业绩预告', '业绩快报', '除权除息'])
  eventType?: string;
}
