import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 't_source_daily'
@Entity({
  name: 't_source_daily',
  comment: '每日交易数据表',
})
@Index('index_ts_code', ['tsCode'])
@Index('index_trade_date', ['tradeDate'])
export class DailyEntity extends CommonEntity {
  @Column({
    name: 'ts_code',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票代码（包含交易所）',
  })
  @ApiProperty({ description: '股票代码（包含交易所）' })
  tsCode: string;

  @Column({
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票名称',
  })
  @ApiProperty({ description: '股票名称' })
  name: string;

  @Column({
    name: 'trade_date',
    type: 'date',
    nullable: false,
    comment: '交易日期',
  })
  @ApiProperty({ description: '交易日期' })
  tradeDate: string;

  @Column({
    name: 'up_limit',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '涨停价(元)',
  })
  @ApiProperty({ description: '涨停价(元)' })
  upLimit: string;

  @Column({
    name: 'down_limit',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '跌停价(元)',
  })
  @ApiProperty({ description: '跌停价(元)' })
  downLimit: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '开盘价(元)',
  })
  @ApiProperty({ description: '开盘价(元)' })
  open: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '最高价(元)',
  })
  @ApiProperty({ description: '最高价(元)' })
  high: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '最低价(元)',
  })
  @ApiProperty({ description: '最低价(元)' })
  low: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '收盘价(元)',
  })
  @ApiProperty({ description: '收盘价(元)' })
  close: string;

  @Column({
    name: 'pre_close',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '昨收价(元)',
  })
  @ApiProperty({ description: '昨收价(元)' })
  preClose: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '涨跌额(元)',
  })
  @ApiProperty({ description: '涨跌额(元)' })
  change: string;

  @Column({
    name: 'pct_chg',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '涨跌幅(%)',
  })
  @ApiProperty({ description: '涨跌幅(%)' })
  pctChg: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '成交量(手)',
  })
  @ApiProperty({ description: '成交量(手)' })
  vol: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '成交额(千元)',
  })
  @ApiProperty({ description: '成交额(千元)' })
  amount: string;

  @Column({
    name: 'turnover_rate',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '换手率(%)',
  })
  @ApiProperty({ description: '换手率(%)' })
  turnoverRate?: string;

  @Column({
    name: 'turnover_rate_f',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '换手率(自由流通股)(%)',
  })
  @ApiProperty({ description: '换手率(自由流通股)(%)' })
  turnoverRateF?: string;

  @Column({
    name: 'volume_ratio',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '量比',
  })
  @ApiProperty({ description: '量比' })
  volumeRatio?: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市盈率(总市值/总利润)',
  })
  @ApiProperty({ description: '市盈率(总市值/总利润)' })
  pe?: string;

  @Column({
    name: 'pe_ttm',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市盈率(TTM)',
  })
  @ApiProperty({ description: '市盈率(TTM)' })
  peTtm?: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市净率(总市值/净资产)',
  })
  @ApiProperty({ description: '市净率(总市值/净资产)' })
  pb?: string;

  @Column({
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市销率',
  })
  @ApiProperty({ description: '市销率' })
  ps?: string;

  @Column({
    name: 'ps_ttm',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市销率(TTM)',
  })
  @ApiProperty({ description: '市销率(TTM)' })
  psTtm?: string;

  @Column({
    name: 'dv_ratio',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '股息率(%)',
  })
  @ApiProperty({ description: '股息率(%)' })
  dvRatio?: string;

  @Column({
    name: 'dv_ttm',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '股息率(TTM)(%)',
  })
  @ApiProperty({ description: '股息率(TTM)(%)' })
  dvTtm?: string;

  @Column({
    name: 'total_share',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '总股本(万股)',
  })
  @ApiProperty({ description: '总股本(万股)' })
  totalShare?: string;

  @Column({
    name: 'float_share',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '流通股本(万股)',
  })
  @ApiProperty({ description: '流通股本(万股)' })
  floatShare?: string;

  @Column({
    name: 'free_share',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '自由流通股本(万股)',
  })
  @ApiProperty({ description: '自由流通股本(万股)' })
  freeShare?: string;

  @Column({
    name: 'total_mv',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '总市值(万元)',
  })
  @ApiProperty({ description: '总市值(万元)' })
  totalMv?: string;

  @Column({
    name: 'circ_mv',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '流通市值(万元)',
  })
  @ApiProperty({ description: '流通市值(万元)' })
  circMv?: string;
}
