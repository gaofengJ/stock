import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

import { PagerDto } from '@/dto/pager.dto';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';

import { PermissionEntity } from './entities/permission.entity';
import { EPermissionAction, EPermissionType } from './permission.enum';

export class PermissionDto {
  @ApiProperty({ description: '权限名称' })
  @IsUnique({
    entity: PermissionEntity,
    message: '权限名称已存在',
  })
  @IsString()
  permissionName: string;

  @ApiProperty({ description: '权限类型' })
  @IsNotEmpty({ message: '权限类型不能为空' })
  @IsEnum(EPermissionType)
  permissionType: string;

  @ApiProperty({ description: '权限操作' })
  @IsNotEmpty({ message: '权限操作不能为空' })
  @IsEnum(EPermissionAction)
  action: string;

  @ApiProperty({ description: '权限描述', required: false })
  @IsOptional()
  desc?: string;
}

export class PermissionQueryDto extends PagerDto {
  @ApiProperty({ description: '权限名称' })
  @IsString()
  permissionName: string;

  @ApiProperty({ description: '权限类型' })
  @IsEnum(EPermissionType)
  permissionType: string;
}

export class PermissionUpdateDto extends PartialType(PermissionDto) {}
