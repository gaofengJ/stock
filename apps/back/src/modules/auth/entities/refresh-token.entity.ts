import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user_refresh_token',
  comment: 'refreshToken表',
})
export class RefreshTokenEntity extends CommonEntity {
  @Column({
    type: 'varchar',
    length: 500,
    nullable: false,
    comment: 'refreshToken值',
  })
  @ApiProperty({ description: 'refreshToken值' })
  sign: string;

  @Column({
    name: 'expired_at',
    nullable: false,
    comment: '令牌过期时间',
  })
  @ApiProperty({ description: '令牌过期时间' })
  expiredAt: Date;

  @Column({
    name: 'access_token',
    nullable: false,
    comment: 'accessToken',
  })
  @ApiProperty({ description: 'accessToken值' })
  accessToken: string;
}
