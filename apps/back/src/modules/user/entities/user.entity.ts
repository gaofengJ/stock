import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user',
  comment: '用户信息表',
})
@Index('index_username', ['username'])
export class UserEntity extends CommonEntity {
  @Column({
    type: 'varchar',
    length: 64,
    nullable: false,
    unique: true,
    comment: '用户名',
  })
  @ApiProperty({ description: '用户名' })
  username: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: false,
    comment: '密码',
  })
  @ApiProperty({ description: '密码' })
  password: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: false,
    comment: '密码盐',
  })
  @ApiProperty({ description: '密码盐' })
  psalt: string;

  @Column({
    type: 'varchar',
    nullable: true,
    comment: '头像',
  })
  @ApiProperty({ description: '头像' })
  avatar: string;

  @Column({
    type: 'varchar',
    nullable: true,
    unique: true,
    comment: '邮箱',
  })
  @ApiProperty({ description: '邮箱' })
  email: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
    comment: '手机号',
  })
  @ApiProperty({ description: '手机号' })
  phone: string;

  @Column({
    name: 'is_active',
    type: 'tinyint',
    nullable: false,
    default: 1,
    comment: '用户是否活跃 0: 否 1: 是',
  })
  @ApiProperty({ description: '用户是否活跃 0: 否 1: 是' })
  isActive: number;

  @Column({
    type: 'int',
    default: 0,
    comment: '用户积分',
  })
  @ApiProperty({ description: '用户积分' })
  point: number;

  @Column({
    type: 'varchar',
    nullable: true,
    comment: '备注',
  })
  @ApiProperty({ description: '备注' })
  remark: string;

  @Column({
    name: 'last_login',
    type: 'timestamp',
    nullable: true,
    comment: '用户最后登录时间',
  })
  @ApiProperty({ description: '用户最后登录时间' })
  lastLogin: Date;
}
