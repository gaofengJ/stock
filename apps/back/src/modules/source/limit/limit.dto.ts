import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

import { PagerDto } from '@/dto/pager.dto';

import { ELimit } from './limit.enum';

export class LimitDto {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsString()
  tsCode: string;

  @ApiProperty({ description: '交易日期' })
  @IsDateString()
  tradeDate: string;

  @ApiProperty({ description: '股票名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '所属行业' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiProperty({ description: '收盘价(元)' })
  @IsString()
  close: string;

  @ApiProperty({ description: '涨跌幅(%)' })
  @IsString()
  pctChg: string;

  @ApiProperty({ description: '成交额(元)' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiProperty({ description: '板上成交额(元)' })
  @IsOptional()
  @IsString()
  limitAmount?: string;

  @ApiProperty({ description: '流通市值(元)' })
  @IsOptional()
  @IsString()
  floatMv?: string;

  @ApiProperty({ description: '总市值(元)' })
  @IsOptional()
  @IsString()
  totalMv?: string;

  @ApiProperty({ description: '换手率(%)' })
  @IsOptional()
  @IsString()
  turnoverRatio?: string;

  @ApiProperty({ description: '封单金额(元)' })
  @IsOptional()
  @IsString()
  fdAmount?: string;

  @ApiProperty({ description: '首次封板时间' })
  @IsOptional()
  @IsString()
  firstTime?: string;

  @ApiProperty({ description: '最后封板时间' })
  @IsOptional()
  @IsString()
  lastTime?: string;

  @ApiProperty({ description: '打开次数' })
  @IsOptional()
  @IsInt()
  openTimes?: number;

  @ApiProperty({ description: '涨停统计（N/T T天有N次涨停）' })
  @IsOptional()
  @IsString()
  upStat?: string;

  @ApiProperty({ description: '连板数' })
  @IsOptional()
  @IsInt()
  limitTimes?: number;

  @ApiProperty({ description: 'D跌停，U涨停，Z炸板' })
  @IsOptional()
  @IsEnum(ELimit)
  limit?: string;
}

export class LimitQueryDto extends PagerDto {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsString()
  tsCode?: string;

  @ApiProperty({ description: '股票名称' })
  @IsString()
  name?: string;

  @ApiProperty({ description: '交易日期' })
  @IsDateString()
  tradeDate?: string;

  @ApiProperty({ description: '过滤字段' })
  @IsOptional()
  fields?: string[];

  @ApiProperty({ description: 'D跌停，U涨停，Z炸板' })
  @IsEnum(ELimit)
  limit?: string;

  @ApiProperty({ description: '连板数' })
  @IsNumber()
  limitTimes?: number;

  @ApiProperty({ description: '开始时间' })
  @IsDateString()
  startDate?: string;

  @ApiProperty({ description: '结束时间' })
  @IsDateString()
  endDate?: string;

  @ApiProperty({ description: '是否打开涨停' })
  @IsBoolean()
  zeroOpenTimes?: boolean;
}

export class LimitUpdateDto extends PartialType(LimitDto) {}
