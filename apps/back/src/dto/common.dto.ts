import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * @description 定义泛型类 CommonDateDto，用于公用的数据传输对象 date
 */
export class CommonDateDto {
  @ApiProperty({ description: '日期' })
  @IsDateString()
  @IsOptional()
  date: string;
}

/**
 * @description 定义泛型类 CommonDateRangeDto，用于公用的数据传输对象 startDate 和 endDate
 */
export class CommonDateRangeDto {
  @ApiProperty({ description: '开始日期' })
  @IsDateString()
  @IsOptional()
  startDate: string;

  @ApiProperty({ description: '结束日期' })
  @IsDateString()
  @IsOptional()
  endDate: string;
}
