import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  Matches,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsIn,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { EStrategyType } from './strategy.enum';

function queryBoolean(value: unknown) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class StrategyListQueryDto {
  @IsOptional() @Matches(/^88[156]\d{3}\.TI$/) sector?: string;

  @ApiProperty({ description: '日期' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: '策略类型' })
  @IsEnum(EStrategyType)
  strategyType: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  breakoutDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(20)
  volumeDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  volumeMultiple?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(20)
  pullbackDays?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  pullbackBelow?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10)
  pullbackAbove?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(1)
  contractionRatio?: number;

  @IsOptional() @IsIn(['new', 'current']) fiveMaMode?: 'new' | 'current';

  @IsOptional()
  @Transform(({ obj, key }) => queryBoolean(obj[key]))
  @IsBoolean()
  aboveMa5?: boolean;

  @IsOptional()
  @Transform(({ obj, key }) => queryBoolean(obj[key]))
  @IsBoolean()
  bullish?: boolean;

  @IsOptional()
  @Transform(({ obj, key }) => queryBoolean(obj[key]))
  @IsBoolean()
  expandingVolume?: boolean;
}
