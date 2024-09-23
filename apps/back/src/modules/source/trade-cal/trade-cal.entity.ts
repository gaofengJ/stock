import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_source_trade_cal',
  comment: '交易日期表',
})
@Index('index_cal_date', ['calDate'])
// 定义一个名为 TradeCalEntity 的类，并继承 CommonEntity
export class TradeCalEntity extends CommonEntity {
  @Column({
    name: 'cal_date',
    type: 'date',
    nullable: false,
    comment: '日期',
  })
  @ApiProperty({ description: '日期' })
  calDate: string;

  @Column({
    name: 'is_open',
    type: 'tinyint',
    nullable: false,
    comment: '是否为交易日期 0: 否 1: 是',
  })
  @ApiProperty({ description: '是否为交易日期 0: 否 1: 是' })
  isOpen: number;

  @Column({
    name: 'pre_trade_date',
    type: 'date',
    nullable: false,
    comment: '上一个交易日期',
  })
  @ApiProperty({ description: '上一个交易日期' })
  preTradeDate: string;
}
