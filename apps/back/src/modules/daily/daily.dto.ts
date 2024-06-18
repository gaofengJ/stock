import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsString } from 'class-validator';
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
  upLimit: number;

  @ApiProperty({ description: '跌停价' })
  downLimit: number;

  @ApiProperty({ description: '开盘价' })
  open: number;

  @ApiProperty({ description: '最高价' })
  high: number;

  @ApiProperty({ description: '最低价' })
  low: number;

  @ApiProperty({ description: '收盘价' })
  close: number;

  @ApiProperty({ description: '昨收价' })
  preClose: number;

  @ApiProperty({ description: '涨跌额' })
  change: number;

  @ApiProperty({ description: '涨跌幅' })
  pctChg: number;

  @ApiProperty({ description: '成交量（手）' })
  vol: number;

  @ApiProperty({ description: '成交额（千元）' })
  amount: number;

  @ApiProperty({ description: '换手率' })
  turnoverRate?: number;

  @ApiProperty({ description: '换手率（自由流通股）' })
  turnoverRateF?: number;

  @ApiProperty({ description: '量比' })
  volumeRatio?: number;

  @ApiProperty({ description: '市盈率（总市值/总利润）' })
  pe?: number;

  @ApiProperty({ description: '市盈率（TTM）' })
  peTtm?: number;

  @ApiProperty({ description: '市净率（总市值/净资产）' })
  pb?: number;

  @ApiProperty({ description: '市销率' })
  ps?: number;

  @ApiProperty({ description: '市销率（TTM）' })
  psTtm?: number;

  @ApiProperty({ description: '股息率（%）' })
  dvRatio?: number;

  @ApiProperty({ description: '股息率（TTM）（%）' })
  dvTtm?: number;

  @ApiProperty({ description: '总股本' })
  totalShare?: number;

  @ApiProperty({ description: '流通股本' })
  floatShare?: number;

  @ApiProperty({ description: '自由流通股本' })
  freeShare?: number;

  @ApiProperty({ description: '总市值' })
  totalMv?: number;

  @ApiProperty({ description: '流通市值' })
  circMv?: number;
}

export class DailyQueryDto extends PagerDto {
  @ApiProperty({ description: '日期' })
  @IsString()
  calDate?: string;

  @ApiProperty({ description: '是否为交易日期' })
  @IsNumber()
  isOpen?: number;
}

export class DailyUpdateDto extends PartialType(DailyDto) {}
