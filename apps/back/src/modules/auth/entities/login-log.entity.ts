import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user_login_log',
  comment: '用户登录日志表',
})
export class LoginLogEntity extends CommonEntity {
  @Column({
    type: 'varchar',
    nullable: true,
    comment: 'IP',
  })
  @ApiProperty({ description: 'IP' })
  ip: string;

  @Column({
    type: 'varchar',
    nullable: true,
    comment: '地址',
  })
  @ApiProperty({ description: '地址' })
  address: string;

  @Column({
    type: 'varchar',
    nullable: true,
    comment: '登录方式',
  })
  @ApiProperty({ description: '登录方式' })
  provider: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: '浏览器ua',
  })
  @ApiProperty({ description: '浏览器ua' })
  ua: string;

  @Column({
    name: 'user_id',
    comment: 'userId',
  })
  @ApiProperty({ description: 'userId' })
  userId: number;
}
