import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

import { PagerDto } from '@/dto/pager.dto';

export class LoginLogQueryDto extends PagerDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  @IsOptional()
  username: string;

  @ApiProperty({ description: '登录IP' })
  @IsOptional()
  @IsString()
  ip?: string;

  @ApiProperty({ description: '登录地点' })
  @IsOptional()
  @IsString()
  address?: string;
}
