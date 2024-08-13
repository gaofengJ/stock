import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber } from 'class-validator';

/**
 * @description 数据传输对象
 */
export class ChainsCountDto {
  @ApiProperty({ description: '开始日期' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: '连板数量' })
  @IsNumber()
  countNum: number;
}

/**
 * @description 数据传输对象
 */
export class ChainsUpgradeDto {
  @ApiProperty({ description: '开始日期' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: '晋级连板数量' })
  @IsNumber()
  upgradeNum: number;
}
