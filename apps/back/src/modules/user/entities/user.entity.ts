import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { Column, Entity, Index } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user',
  comment: '用户信息表',
})
@Index('index_username', ['username'])
export class UserEntity extends CommonEntity {
  @Column({
    name: 'username',
    type: 'varchar',
    length: 64,
    nullable: false,
    unique: true,
    comment: '用户名',
  })
  @ApiProperty({ description: '用户名' })
  username: string;

  @Column({
    name: 'password',
    type: 'varchar',
    length: 255,
    select: false,
    nullable: false,
    comment: '密码',
  })
  @ApiHideProperty()
  @Exclude()
  password: string;

  @Column({
    name: 'email',
    type: 'varchar',
    nullable: true,
    unique: true,
    comment: '用户邮箱',
  })
  @ApiProperty({ description: '用户邮箱' })
  email: string;

  @Column({
    name: 'phone',
    type: 'varchar',
    length: 20,
    nullable: true,
    unique: true,
    comment: '用户手机号',
  })
  @ApiProperty({ description: '用户手机号' })
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
    name: 'point',
    type: 'int',
    default: 0,
    comment: '用户积分',
  })
  @ApiProperty({ description: '用户积分' })
  point: number;

  @Column({
    name: 'last_login',
    type: 'timestamp',
    nullable: true,
    comment: '用户最后登录时间',
  })
  @ApiProperty({ description: '用户最后登录时间' })
  lastLogin: Date;
}
