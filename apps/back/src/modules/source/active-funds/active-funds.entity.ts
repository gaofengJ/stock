import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_source_active_funds',
  comment: '游资名录表',
})
@Index('index_name', ['name'])
export class ActiveFundsEntity extends CommonEntity {
  @Column({
    type: 'varchar',
    length: 16,
    comment: '游资名称',
  })
  @ApiProperty({ description: '游资名称' })
  name: string;

  @Column({
    type: 'varchar',
    length: 1024,
    comment: '关联机构',
  })
  @ApiProperty({ description: '关联机构' })
  orgs: string;

  @Column({
    type: 'varchar',
    length: 1024,
    comment: '说明',
  })
  @ApiProperty({ description: '说明' })
  desc: string;
}
