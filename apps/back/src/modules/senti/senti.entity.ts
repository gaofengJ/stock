import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 't_senti'
@Entity({
  name: 't_senti',
  comment: '短线情绪表',
})
// 定义一个名为 SentiEntity 的类，并继承 CommonEntity
export class SentiEntity extends CommonEntity {
  @Column({
    name: 'cal_date',
    type: 'date',
    nullable: false,
    comment: '日期',
  })
  @ApiProperty({ description: '日期' })
  calDate: string;

  @Column({
    name: 'a',
    type: 'int',
    nullable: false,
    comment: '2020年7月7日涨停，非一字涨停，非ST',
  })
  @ApiProperty({ description: '2020年7月7日涨停，非一字涨停，非ST' })
  a: number;

  @Column({
    name: 'b',
    type: 'int',
    nullable: false,
    comment: '2020年7月6日涨停，非一字涨停，非ST',
  })
  @ApiProperty({ description: '2020年7月6日涨停，非一字涨停，非ST' })
  b: number;

  @Column({
    name: 'c',
    type: 'int',
    nullable: false,
    comment: '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日高开',
  })
  @ApiProperty({
    description: '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日高开',
  })
  c: number;

  @Column({
    name: 'd',
    type: 'int',
    nullable: false,
    comment: '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日上涨',
  })
  @ApiProperty({
    description: '2020年7月6日涨停，非一字涨停，非ST，2020年7月7日上涨',
  })
  d: number;

  @Column({
    name: 'e',
    type: 'int',
    nullable: false,
    comment: '2020年7月7日曾涨停，非ST',
  })
  @ApiProperty({ description: '2020年7月7日曾涨停，非ST' })
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
