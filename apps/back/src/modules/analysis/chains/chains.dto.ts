import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber } from 'class-validator';

export class ChainsCountLimitUpTimesQueryDto {
  @ApiProperty({ description: '开始日期' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ description: '连板数量' })
  @IsNumber()
  limitTimes: number;
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

  @ApiProperty({ description: '连板晋级成功率' })
  @IsNumber()
  upgradeNum: number;
}
