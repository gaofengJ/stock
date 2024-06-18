import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';
import { StockBasicEntity } from '../stock-basic/stock-basic.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 't_basic_daily'
@Entity('t_daily')
export class DailyEntity extends CommonEntity {
  @Column({
    name: 'ts_code',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票代码',
  })
  @ApiProperty({ description: '股票代码' })
  tsCode: string;

  @Column({
    name: 'trade_date',
    type: 'varchar',
    length: 16,
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
    comment: '涨停价',
  })
  @ApiProperty({ description: '涨停价' })
  upLimit: number;

  @Column({
    name: 'down_limit',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '跌停价',
  })
  @ApiProperty({ description: '跌停价' })
  downLimit: number;

  @Column({
    name: 'open',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '开盘价',
  })
  @ApiProperty({ description: '开盘价' })
  open: number;

  @Column({
    name: 'high',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '最高价',
  })
  @ApiProperty({ description: '最高价' })
  high: number;

  @Column({
    name: 'low',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '最低价',
  })
  @ApiProperty({ description: '最低价' })
  low: number;

  @Column({
    name: 'close',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '收盘价',
  })
  @ApiProperty({ description: '收盘价' })
  close: number;

  @Column({
    name: 'pre_close',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '昨收价',
  })
  @ApiProperty({ description: '昨收价' })
  preClose: number;

  @Column({
    name: 'change',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '涨跌额',
  })
  @ApiProperty({ description: '涨跌额' })
  change: number;

  @Column({
    name: 'pct_chg',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '涨跌幅',
  })
  @ApiProperty({ description: '涨跌幅' })
  pctChg: number;

  @Column({
    name: 'vol',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '成交量（手）',
  })
  @ApiProperty({ description: '成交量（手）' })
  vol: number;

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '成交额（千元）',
  })
  @ApiProperty({ description: '成交额（千元）' })
  amount: number;

  @Column({
    name: 'turnover_rate',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '换手率',
  })
  @ApiProperty({ description: '换手率' })
  turnoverRate: number;

  @Column({
    name: 'turnover_rate_f',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '换手率（自由流通股）',
  })
  @ApiProperty({ description: '换手率（自由流通股）' })
  turnoverRateF: number;

  @Column({
    name: 'volume_ratio',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '量比',
  })
  @ApiProperty({ description: '量比' })
  volumeRatio: number;

  @Column({
    name: 'pe',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市盈率（总市值/总利润）',
  })
  @ApiProperty({ description: '市盈率（总市值/总利润）' })
  pe: number;

  @Column({
    name: 'pe_ttm',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市盈率（TTM）',
  })
  @ApiProperty({ description: '市盈率（TTM）' })
  peTtm: number;

  @Column({
    name: 'pb',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市净率（总市值/净资产）',
  })
  @ApiProperty({ description: '市净率（总市值/净资产）' })
  pb: number;

  @Column({
    name: 'ps',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市销率',
  })
  @ApiProperty({ description: '市销率' })
  ps: number;

  @Column({
    name: 'ps_ttm',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '市销率（TTM）',
  })
  @ApiProperty({ description: '市销率（TTM）' })
  psTtm: number;

  @Column({
    name: 'dv_ratio',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '股息率（%）',
  })
  @ApiProperty({ description: '股息率（%）' })
  dvRatio: number;

  @Column({
    name: 'dv_ttm',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '股息率（TTM）（%）',
  })
  @ApiProperty({ description: '股息率（TTM）（%）' })
  dvTtm: number;

  @Column({
    name: 'total_share',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '总股本',
  })
  @ApiProperty({ description: '总股本' })
  totalShare: number;

  @Column({
    name: 'float_share',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '流通股本',
  })
  @ApiProperty({ description: '流通股本' })
  floatShare: number;

  @Column({
    name: 'free_share',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '自由流通股本',
  })
  @ApiProperty({ description: '自由流通股本' })
  freeShare: number;

  @Column({
    name: 'total_mv',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '总市值',
  })
  @ApiProperty({ description: '总市值' })
  totalMv: number;

  @Column({
    name: 'circ_mv',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '流通市值',
  })
  @ApiProperty({ description: '流通市值' })
  circMv: number;

  @ManyToOne(() => StockBasicEntity, (stockBasic) => stockBasic.tsCode)
  @JoinColumn({ name: 'ts_code' })
  stockBasic: StockBasicEntity;
}
