import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * @description 定义泛型类 CommonDto，用于公用的数据传输对象
 */
export class CommonDto {
  @ApiProperty({ description: '日期' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiProperty({ description: '开始日期' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ description: '结束日期' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}
