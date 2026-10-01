import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, Matches } from 'class-validator';
import { EStrategyType } from './strategy.enum';

export class StrategyListQueryDto {
  @IsOptional() @Matches(/^88[156]\d{3}\.TI$/) sector?: string;

  @ApiProperty({ description: '日期' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: '策略类型' })
  @IsEnum(EStrategyType)
  strategyType: string;
}
