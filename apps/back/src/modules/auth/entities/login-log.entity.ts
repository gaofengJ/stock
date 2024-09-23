import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user_login_log',
  comment: '用户登录日志表',
})
export class LoginLogEntity extends CommonEntity {
  @Column({ nullable: true })
  @ApiProperty({ description: 'IP' })
  ip: string;

  @Column({ nullable: true })
  @ApiProperty({ description: '地址' })
  address: string;

  @Column({ nullable: true })
  @ApiProperty({ description: '登录方式' })
  provider: string;

  @Column({ length: 500, nullable: true })
  @ApiProperty({ description: '浏览器ua' })
  ua: string;

  @Column({
    name: 'user_id',
    comment: 'user_id',
  })
  userId: number;
}
