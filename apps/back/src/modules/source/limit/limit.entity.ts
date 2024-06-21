import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 t_source_limit
@Entity({
  name: 't_source_limit',
  comment: '每日涨跌停个股统计表',
})

// 定义一个名为 LimitEntity 的类，并继承 CommonEntity
export class LimitEntity extends CommonEntity {
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
    name: 'trade_date',
    type: 'date',
    nullable: false,
    comment: '交易日期',
  })
  @ApiProperty({ description: '交易日期' })
  tradeDate: string;

  @Column({
    name: 'name',
    type: 'varchar',
    length: 16,
    nullable: false,
    comment: '股票名称',
  })
  @ApiProperty({ description: '股票名称' })
  name: string;

  @Column({
    name: 'industry',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '所属行业',
  })
  @ApiProperty({ description: '所属行业' })
  industry: string;

  @Column({
    name: 'close',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '收盘价',
  })
  @ApiProperty({ description: '收盘价' })
  close: string;

  @Column({
    name: 'pct_chg',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '涨跌幅',
  })
  @ApiProperty({ description: '涨跌幅' })
  pctChg: string;

  @Column({
    name: 'amount',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '成交额（千元）',
  })
  @ApiProperty({ description: '成交额（千元）' })
  amount: string;

  @Column({
    name: 'limit_amount',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '板上成交额（千元）',
  })
  @ApiProperty({ description: '板上成交额（千元）' })
  limitAmount: string;

  @Column({
    name: 'float_mv',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '流通市值',
  })
  @ApiProperty({ description: '流通市值' })
  floatMv: string;

  @Column({
    name: 'total_mv',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '总市值',
  })
  @ApiProperty({ description: '总市值' })
  totalMv: string;

  @Column({
    name: 'turnover_ratio',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '换手率',
  })
  @ApiProperty({ description: '换手率' })
  turnoverRatio: string;

  @Column({
    name: 'fd_amount',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: true,
    comment: '封单金额',
  })
  @ApiProperty({ description: '封单金额' })
  fdAmount: string;

  @Column({
    name: 'first_time',
    type: 'time',
    nullable: true,
    comment: '首次封板时间',
  })
  @ApiProperty({ description: '首次封板时间' })
  firstTime: string;

  @Column({
    name: 'last_time',
    type: 'time',
    nullable: true,
    comment: '最后封板时间',
  })
  @ApiProperty({ description: '最后封板时间' })
  lastTime: string;

  @Column({
    name: 'open_times',
    type: 'int',
    nullable: true,
    comment: '打开次数',
  })
  @ApiProperty({ description: '打开次数' })
  openTimes: number;

  @Column({
    name: 'up_stat',
    type: 'varchar',
    length: 16,
    nullable: true,
    comment: '涨停统计（N/T T天有N次涨停）',
  })
  @ApiProperty({ description: '涨停统计（N/T T天有N次涨停）' })
  upStat: string;

  @Column({
    name: 'limit_times',
    type: 'int',
    nullable: true,
    comment: '连板数',
  })
  @ApiProperty({ description: '连板数' })
  limitTimes: number;

  @Column({
    name: 'limit',
    type: 'varchar',
    length: 1,
    nullable: true,
    comment: 'D跌停，U涨停，Z炸板',
  })
  @ApiProperty({ description: 'D跌停，U涨停，Z炸板' })
  limit: string;
}
