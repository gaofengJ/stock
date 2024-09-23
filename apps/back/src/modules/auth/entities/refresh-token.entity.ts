import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user_refresh_token',
  comment: 'refresh token表',
})
export class RefreshTokenEntity extends CommonEntity {
  @Column({
    name: 'sign',
    comment: 'refresh token值',
    length: 500,
  })
  sign: string;

  @Column({
    name: 'expired_at',
    comment: '令牌过期时间',
  })
  expiredAt: Date;

  @Column({
    name: 'access_token',
    comment: 'access_token',
  })
  accessToken: string;
}
