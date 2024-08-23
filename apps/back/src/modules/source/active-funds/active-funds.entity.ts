import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

// 使用 @Entity 装饰器将这个类标记为一个实体，并指定数据库表名为 't_source_active_funds'
@Entity({
  name: 't_source_active_funds',
  comment: '游资名录表',
})
@Index('index_name_test', ['name'])
export class ActiveFundsEntity extends CommonEntity {
  @Column({
    name: 'name',
    type: 'varchar',
    length: 16,
    comment: '游资名称',
  })
  @ApiProperty({ description: '游资名称测试' })
  name: string;

  @Column({
    name: 'orgs',
    type: 'varchar',
    length: 1024,
    comment: '关联机构',
  })
  @ApiProperty({ description: '关联机构' })
  orgs: string;

  @Column({
    name: 'desc',
    type: 'varchar',
    length: 1024,
    comment: '说明',
  })
  @ApiProperty({ description: '说明' })
  desc: string;
}
