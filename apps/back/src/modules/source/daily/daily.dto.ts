import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';
import { PagerDto } from '@/dto/pager.dto';
import { DailyEntity } from './daily.entity';

export class DailyDto extends PartialType(DailyEntity) {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsUnique({
    entity: DailyEntity,
    message: '已存在相同名称的股票代码（包含交易所）',
  })
  @IsString()
  tsCode: string;

  @ApiProperty({ description: '股票名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '交易日期' })
  @IsDateString()
  tradeDate: string;

  @ApiProperty({ description: '涨停价' })
  @IsString()
  upLimit: string;

  @ApiProperty({ description: '跌停价' })
  @IsString()
  downLimit: string;

  @ApiProperty({ description: '开盘价' })
  @IsString()
  open: string;

  @ApiProperty({ description: '最高价' })
  @IsString()
  high: string;

  @ApiProperty({ description: '最低价' })
  @IsString()
  low: string;

  @ApiProperty({ description: '收盘价' })
  @IsString()
  close: string;

  @ApiProperty({ description: '昨收价' })
  @IsString()
  preClose: string;

  @ApiProperty({ description: '涨跌额' })
  @IsString()
  change: string;

  @ApiProperty({ description: '涨跌幅' })
  @IsString()
  pctChg: string;

  @ApiProperty({ description: '成交量（手）' })
  @IsString()
  vol: string;

  @ApiProperty({ description: '成交额（万元）' })
  @IsString()
  amount: string;

  @ApiProperty({ description: '换手率' })
  @IsOptional()
  @IsString()
  turnoverRate?: string;

  @ApiProperty({ description: '换手率（自由流通股）' })
  @IsOptional()
  @IsString()
  turnoverRateF?: string;

  @ApiProperty({ description: '量比' })
  @IsOptional()
  @IsString()
  volumeRatio?: string;

  @ApiProperty({ description: '市盈率（总市值/总利润）' })
  @IsOptional()
  @IsString()
  pe?: string;

  @ApiProperty({ description: '市盈率（TTM）' })
  @IsOptional()
  @IsString()
  peTtm?: string;

  @ApiProperty({ description: '市净率（总市值/净资产）' })
  @IsOptional()
  @IsString()
  pb?: string;

  @ApiProperty({ description: '市销率' })
  @IsOptional()
  @IsString()
  ps?: string;

  @ApiProperty({ description: '市销率（TTM）' })
  @IsOptional()
  @IsString()
  psTtm?: string;

  @ApiProperty({ description: '股息率（%）' })
  @IsOptional()
  dvRatio?: string;

  @ApiProperty({ description: '股息率（TTM）（%）' })
  @IsString()
  dvTtm?: string;

  @ApiProperty({ description: '总股本（万股）' })
  @IsOptional()
  totalShare?: string;

  @ApiProperty({ description: '流通股本（万股）' })
  @IsString()
  floatShare?: string;

  @ApiProperty({ description: '自由流通股本（万股）' })
  @IsOptional()
  @IsString()
  freeShare?: string;

  @ApiProperty({ description: '总市值（万元）' })
  @IsOptional()
  @IsString()
  totalMv?: string;

  @ApiProperty({ description: '流通市值（万元）' })
  @IsOptional()
  @IsString()
  circMv?: string;
}

export class DailyQueryDto extends PagerDto {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsString()
  tsCode?: string;

  @ApiProperty({ description: '交易日期' })
  @IsDateString()
  tradeDate?: string;
}

export class DailyUpdateDto extends PartialType(DailyDto) {}
