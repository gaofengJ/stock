import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsString, IsInt } from 'class-validator';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';
import { PagerDto } from '@/dto/pager.dto';
import { SentiEntity } from './senti.entity';

export class SentiDto extends PartialType(SentiEntity) {
  @ApiProperty({ description: '日期' })
  @IsUnique({
    entity: SentiEntity,
    message: '已存在相同名称的日期',
  })
  @IsDateString()
  calDate: string;

  @ApiProperty({ description: '2020年7月7日涨停，非一字涨停，非ST' })
  @IsInt()
  a: number;

  @ApiProperty({ description: '2020年7月6日涨停，非一字涨停，非ST' })
  @IsInt()
  b: number;

  @ApiProperty({
    description: '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日高开',
  })
  @IsInt()
  c: number;

  @ApiProperty({
    description: '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日上涨',
  })
  @IsInt()
  d: number;

  @ApiProperty({ description: '2020年7月7日曾涨停，非ST' })
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
  @ApiProperty({ description: '日期' })
  @IsString()
  calDate?: string;
}

export class SentiUpdateDto extends PartialType(SentiDto) {}
