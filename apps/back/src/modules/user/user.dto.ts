import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
} from 'class-validator';

import { PagerDto } from '@/dto/pager.dto';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';

import { UserEntity } from './entities/user.entity';
import { EIsActive } from './user.enum';

export class UserDto {
  @ApiProperty({ description: '用户名' })
  @IsUnique({
    entity: UserEntity,
    message: '用户名已存在',
  })
  @IsString()
  username: string;

  @ApiProperty({ description: '密码' })
  @IsNotEmpty({ message: '密码不能为空' })
  @IsString()
  password: string;

  @ApiProperty({ description: '用户邮箱', required: false })
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsUnique({
    entity: UserEntity,
    message: '邮箱已存在',
  })
  email?: string;

  @ApiProperty({ description: '用户手机号', required: false })
  @IsOptional()
  @IsPhoneNumber(undefined, { message: '手机号格式不正确' })
  @IsUnique({
    entity: UserEntity,
    message: '手机号已存在',
  })
  phone?: string;

  @ApiProperty({ description: '用户是否活跃 0: 否 1: 是' })
  @IsEnum(EIsActive, { message: '状态值只能是 0 或 1' })
  isActive: number;

  @ApiProperty({ description: '用户积分' })
  @IsInt({ message: '积分必须是整数' })
  point: number;

  @ApiProperty({ description: '用户最后登录时间', required: false })
  @IsOptional()
  @IsDateString({}, { message: '最后登录时间格式不正确' })
  lastLogin?: Date;
}

export class UserQueryDto extends PagerDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  username: string;

  @ApiProperty({ description: '手机号' })
  @IsString()
  phone: string;
}

export class UserUpdateDto extends PartialType(UserDto) {}
