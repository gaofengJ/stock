import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, Matches } from 'class-validator';

export class IntradayCountsQueryDto {
  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date?: string;

  @ApiPropertyOptional({ enum: [1, 5, 10, 20, 30], default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([1, 5, 10, 20, 30])
  days = 10;
}
