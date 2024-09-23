import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

/**
 * 角色-权限关联表实体
 */
@Entity({
  name: 't_role_permission',
  comment: '角色-权限关联表',
})
export class RolePermissionEntity extends CommonEntity {
  @Column({
    name: 'role_id',
    type: 'int',
    nullable: true,
    comment: 'roleId',
  })
  @ApiProperty({ description: 'roleId' })
  roleId: number;

  @Column({
    name: 'permission_id',
    type: 'int',
    nullable: true,
    comment: 'permissionId',
  })
  @ApiProperty({ description: 'permissionId' })
  permissionId: number;
}
