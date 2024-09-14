import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PagerDto } from '@/dto/pager.dto';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';

import { RoleEntity } from './entities/role.entity';
import { ERole } from './role.enum';

export class RoleDto {
  @ApiProperty({ description: '角色名称' })
  @IsUnique({
    entity: RoleEntity,
    message: '角色名称已存在',
  })
  @IsEnum(ERole)
  roleName: string;

  @ApiProperty({ description: '角色描述' })
  @IsOptional()
  @IsString()
  desc?: string;
}

export class RoleQueryDto extends PagerDto {
  @ApiProperty({ description: '角色名称' })
  @IsEnum(ERole)
  roleName: string;
}

export class RoleUpdateDto extends PartialType(RoleDto) {}
