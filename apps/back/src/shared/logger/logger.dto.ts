import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

export class loggerQueryDto {
  @ApiProperty({ description: '开始时间' })
  @IsDateString()
  startDate?: string;

  @ApiProperty({ description: '结束时间' })
  @IsDateString()
  endDate?: string;

  @ApiProperty({ description: '日志类型' })
  @IsString()
  loggerType?: 'normal' | 'error';
}
