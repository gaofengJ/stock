import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_permission',
  comment: '用户权限表',
})
export class PermissionEntity extends CommonEntity {
  @Column({
    name: 'permission_name',
    type: 'varchar',
    length: 64,
    nullable: false,
    unique: true,
    comment: '权限名称, 页面或API接口',
  })
  @ApiProperty({ description: '权限名称, 页面或API接口' })
  permissionName: string;

  @Column({
    name: 'permission_type',
    type: 'varchar',
    length: 64,
    nullable: false,
    comment: '权限类型, 如 API、页面',
  })
  @ApiProperty({ description: '权限类型, 如 API、页面' })
  permissionType: string;

  @Column({
    type: 'varchar',
    nullable: false,
    comment: '权限操作，如 read、write、delete',
  })
  @ApiProperty({ description: '权限操作，如 read、write、delete' })
  action: string;

  @Column({
    type: 'varchar',
    length: 1024,
    nullable: true,
    comment: '权限描述',
  })
  @ApiProperty({ description: '权限描述' })
  desc: string;
}
