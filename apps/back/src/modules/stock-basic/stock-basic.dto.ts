import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class StockBasicDto {
  @ApiProperty({ description: '名称' })
  @IsString()
  value: string;
}

export class StockBasicQueryDto {
  @ApiProperty({ description: '当前页码', type: [Number] })
  @IsString()
  pageNum: number;

  @ApiProperty({ description: '每页显示的项目数', type: [Number] })
  @IsString()
  pageSize: number;

  @ApiProperty({ description: '股票名称', type: [Number] })
  @IsString()
  userIds: number[];

  @ApiProperty({ description: '股票代码' })
  @IsString()
  deptId: number;
}

export class StockBasicUpdateDto extends PartialType(StockBasicDto) {}
