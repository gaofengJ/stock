import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 't_processed_senti'
@Entity({
  name: 't_processed_senti',
  comment: '赚钱效应表',
})
@Index('index_trade_date', ['tradeDate'])
export class SentiEntity extends CommonEntity {
  @Column({
    name: 'trade_date',
    type: 'date',
    nullable: false,
    comment: '交易日期',
  })
  @ApiProperty({ description: '交易日期' })
  tradeDate: string;

  @Column({
    name: 'a',
    type: 'int',
    nullable: false,
    comment: '当日涨停，非一字涨停，非ST',
  })
  @ApiProperty({ description: '当日涨停，非一字涨停，非ST' })
  a: number;

  @Column({
    name: 'b',
    type: 'int',
    nullable: false,
    comment: '前一日涨停，非一字涨停，非ST',
  })
  @ApiProperty({ description: '前一日涨停，非一字涨停，非ST' })
  b: number;

  @Column({
    name: 'c',
    type: 'int',
    nullable: false,
    comment: '前一日涨停，非一字涨停，非ST，当日高开',
  })
  @ApiProperty({
    description: '前一日涨停，非一字涨停，非ST，当日高开',
  })
  c: number;

  @Column({
    name: 'd',
    type: 'int',
    nullable: false,
    comment: '前一日涨停，非一字涨停，非ST，当日上涨',
  })
  @ApiProperty({
    description: '前一日涨停，非一字涨停，非ST，当日上涨',
  })
  d: number;

  @Column({
    name: 'e',
    type: 'int',
    nullable: false,
    comment: '当日曾涨停，非ST',
  })
  @ApiProperty({ description: '当日曾涨停，非ST' })
  e: number;

  @Column({
    name: 'senti_a',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '非一字涨停',
  })
  @ApiProperty({ description: '非一字涨停' })
  sentiA: string;

  @Column({
    name: 'senti_b',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '打板高开率',
  })
  @ApiProperty({ description: '打板高开率' })
  sentiB: string;

  @Column({
    name: 'senti_c',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '打板成功率',
  })
  @ApiProperty({ description: '打板成功率' })
  sentiC: string;

  @Column({
    name: 'senti_d',
    type: 'decimal',
    precision: 16,
    scale: 2,
    nullable: false,
    comment: '打板被砸率',
  })
  @ApiProperty({ description: '打板被砸率' })
  sentiD: string;
}
