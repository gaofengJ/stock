import { ApiProperty } from '@nestjs/swagger';

export class UserModel {
  @ApiProperty({ description: '用户名' })
  username: string;

  @ApiProperty({ description: '密码' })
  password: string;

  @ApiProperty({ description: '头像' })
  avatar: string;

  @ApiProperty({ description: '邮箱' })
  email: string;

  @ApiProperty({ description: '手机号' })
  phone: string;

  @ApiProperty({ description: '用户是否活跃 0: 否 1: 是' })
  isActive: number;

  @ApiProperty({ description: '用户积分' })
  point: number;

  @ApiProperty({ description: '备注' })
  remark: string;

  @ApiProperty({ description: '用户最后登录时间', required: false })
  lastLogin?: string;
}
