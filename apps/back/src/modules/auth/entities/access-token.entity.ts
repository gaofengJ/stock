import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';

import { CommonEntity } from '@/entity/common.entity';

@Entity({
  name: 't_user_access_token',
  comment: 'accessToken表',
})
export class AccessTokenEntity extends CommonEntity {
  @Column({
    type: 'varchar',
    length: 128,
    nullable: false,
    comment: 'accessToken值',
  })
  @ApiProperty({ description: 'accessToken值' })
  sign: string;

  @Column({
    name: 'expired_at',
    nullable: false,
    comment: '令牌过期时间',
  })
  @ApiProperty({ description: '令牌过期时间' })
  expiredAt: Date;

  @Column({
    name: 'user_id',
    type: 'int',
    nullable: false,
    comment: 'userId',
  })
  @ApiProperty({ description: 'userId' })
  userId: number;
}
