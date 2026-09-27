import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MARKET_SCOPES, MarketScope } from './market.constants';

export class MarketQueryDto {
  @ApiPropertyOptional({ example: '2026-09-24' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date?: string;

  @ApiPropertyOptional({ enum: MARKET_SCOPES, default: 'all' })
  @IsOptional()
  @IsIn(MARKET_SCOPES)
  scope: MarketScope = 'all';

  @ApiPropertyOptional({ enum: [20, 60, 120, 250, 730], default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsIn([20, 60, 120, 250, 730])
  days = 20;

  @ApiPropertyOptional({ enum: ['U', 'D', 'Z'] })
  @IsOptional()
  @IsIn(['U', 'D', 'Z'])
  type = 'U';

  @ApiPropertyOptional() @IsOptional() @IsString() keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  height?: number;
}
export class DragonQueryDto {
  @ApiPropertyOptional({ example: '2026-09-24' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date: string;

  @Matches(/^\d{6}\.(SH|SZ|BJ)$/) code: string;
}
