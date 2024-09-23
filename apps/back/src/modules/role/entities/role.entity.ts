import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_role',
  comment: '用户角色表',
})
export class RoleEntity extends CommonEntity {
  @Column({
    name: 'role_name',
    type: 'varchar',
    length: 64,
    nullable: false,
    unique: true,
    comment: '角色名称',
  })
  @ApiProperty({ description: '角色名称' })
  roleName: string;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: false,
    comment: '角色描述',
  })
  @ApiProperty({ description: '角色描述' })
  desc: string;
}
