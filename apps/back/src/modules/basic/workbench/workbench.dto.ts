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

  @IsOptional() @Matches(/^88[156]\d{3}\.TI$/) sector?: string;

  @IsOptional() @IsString() @MaxLength(256) org?: string;

  @IsOptional() @IsIn(['7', '30']) days?: string;

  @IsOptional() @IsString() @MaxLength(64) keyword?: string;
}
