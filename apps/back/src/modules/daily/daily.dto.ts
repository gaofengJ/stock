import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';
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

  @ApiProperty({ description: '交易日期' })
  @IsDateString()
  tradeDate: string;

  @ApiProperty({ description: '涨停价' })
  upLimit: string;

  @ApiProperty({ description: '跌停价' })
  downLimit: string;

  @ApiProperty({ description: '开盘价' })
  open: string;

  @ApiProperty({ description: '最高价' })
  high: string;

  @ApiProperty({ description: '最低价' })
  low: string;

  @ApiProperty({ description: '收盘价' })
  close: string;

  @ApiProperty({ description: '昨收价' })
  preClose: string;

  @ApiProperty({ description: '涨跌额' })
  change: string;

  @ApiProperty({ description: '涨跌幅' })
  pctChg: string;

  @ApiProperty({ description: '成交量（手）' })
  vol: string;

  @ApiProperty({ description: '成交额（万元）' })
  amount: string;

  @ApiProperty({ description: '换手率' })
  turnoverRate?: string;

  @ApiProperty({ description: '换手率（自由流通股）' })
  turnoverRateF?: string;

  @ApiProperty({ description: '量比' })
  volumeRatio?: string;

  @ApiProperty({ description: '市盈率（总市值/总利润）' })
  pe?: string;

  @ApiProperty({ description: '市盈率（TTM）' })
  peTtm?: string;

  @ApiProperty({ description: '市净率（总市值/净资产）' })
  pb?: string;

  @ApiProperty({ description: '市销率' })
  ps?: string;

  @ApiProperty({ description: '市销率（TTM）' })
  psTtm?: string;

  @ApiProperty({ description: '股息率（%）' })
  dvRatio?: string;

  @ApiProperty({ description: '股息率（TTM）（%）' })
  dvTtm?: string;

  @ApiProperty({ description: '总股本（万股）' })
  totalShare?: string;

  @ApiProperty({ description: '流通股本（万股）' })
  floatShare?: string;

  @ApiProperty({ description: '自由流通股本（万股）' })
  freeShare?: string;

  @ApiProperty({ description: '总市值（万元）' })
  totalMv?: string;

  @ApiProperty({ description: '流通市值（万元）' })
  circMv?: string;
}

export class DailyQueryDto extends PagerDto {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsString()
  tsCode?: string;
}

export class DailyUpdateDto extends PartialType(DailyDto) {}
