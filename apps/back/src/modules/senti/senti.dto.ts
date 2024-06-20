import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsString, IsInt } from 'class-validator';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';
import { PagerDto } from '@/dto/pager.dto';
import { SentiEntity } from './senti.entity';

export class SentiDto extends PartialType(SentiEntity) {
  @ApiProperty({ description: '交易日期' })
  @IsUnique({
    entity: SentiEntity,
    message: '已存在相同名称的交易日期',
  })
  @IsDateString()
  tradeDate: string;

  @ApiProperty({ description: '当日涨停，非一字涨停，非ST' })
  @IsInt()
  a: number;

  @ApiProperty({ description: '前一日涨停，非一字涨停，非ST' })
  @IsInt()
  b: number;

  @ApiProperty({
    description: '前一日涨停，非一字涨停，非ST，当日高开',
  })
  @IsInt()
  c: number;

  @ApiProperty({
    description: '前一日涨停，非一字涨停，非ST，当日上涨',
  })
  @IsInt()
  d: number;

  @ApiProperty({ description: '当日曾涨停，非ST' })
  @IsInt()
  e: number;

  @ApiProperty({ description: '非一字涨停' })
  @IsString()
  sentiA: string;

  @ApiProperty({ description: '打板高开率' })
  @IsString()
  sentiB: string;

  @ApiProperty({ description: '打板成功率' })
  @IsString()
  sentiC: string;

  @ApiProperty({ description: '打板被砸率' })
  @IsString()
  sentiD: string;
}

export class SentiQueryDto extends PagerDto {
  @ApiProperty({ description: '交易日期' })
  @IsString()
  tradeDate?: string;
}

export class SentiUpdateDto extends PartialType(SentiDto) {}
