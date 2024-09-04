import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum } from 'class-validator';
import { EStrategyType } from './strategy.enum';

export class StrategyListQueryDto {
  @ApiProperty({ description: '日期' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: '策略类型' })
  @IsEnum(EStrategyType)
  strategyType: string;
}
