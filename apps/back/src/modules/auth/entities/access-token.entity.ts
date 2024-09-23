import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user_access_token',
  comment: 'access token表',
})
export class AccessTokenEntity extends CommonEntity {
  @Column({
    name: 'sign',
    comment: 'access token值',
    length: 500,
  })
  sign: string;

  @Column({
    name: 'expired_at',
    comment: '令牌过期时间',
  })
  expiredAt: Date;

  @Column({
    name: 'user_id',
    comment: 'user_id',
  })
  userId: number;
}
