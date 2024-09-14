import { Entity, Column } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { CommonEntity } from '@/entity/common.entity';

/**
 * 用户-角色关联表实体
 */
@Entity('t_user_role')
export class UserRoleEntity extends CommonEntity {
  @Column({
    name: 'user_id',
    type: 'int',
    nullable: true,
    comment: 'userId',
  })
  @ApiProperty({ description: 'userId' })
  userId: number;

  @Column({
    name: 'role_id',
    type: 'int',
    nullable: true,
    comment: 'roleId',
  })
  @ApiProperty({ description: 'roleId' })
  roleId: number;
}
