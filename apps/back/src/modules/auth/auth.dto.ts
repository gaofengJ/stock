import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

// Preserve raw body types even when the existing global pipe enables implicit conversion.
const StrictValue = () =>
  Transform(({ obj, key }) =>
    key === 'username' && typeof obj[key] === 'string'
      ? obj[key].trim().toLowerCase()
      : obj[key],
  );

export class RegisterDto {
  @StrictValue()
  @IsString()
  @Matches(/^[a-z][a-z0-9_]{2,31}$/, {
    message: '用户名为3至32位字母、数字或下划线，以字母开头',
  })
  username: string;

  @StrictValue()
  @IsString()
  @Length(10, 128, { message: '密码长度为10至128个字符' })
  password: string;

  @IsOptional()
  @StrictValue()
  @IsString()
  @Length(1, 40)
  nickname?: string;
}
export class LoginDto {
  @StrictValue()
  @IsString()
  @Length(1, 64)
  username: string;

  @StrictValue() @IsString() @Length(1, 128) password: string;
}
export class PasswordDto {
  @StrictValue() @IsString() @Length(1, 128) currentPassword: string;

  @StrictValue() @IsString() @Length(10, 128) newPassword: string;
}
export class ProfileDto {
  @StrictValue() @IsString() @Length(1, 40) nickname: string;
}
export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;

  @IsOptional() @StrictValue() @IsString() @Length(0, 100) keyword?: string;
}
export class UserQueryDto extends PageDto {
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) active?: number;
}
export class UserUpdateDto {
  @IsOptional() @StrictValue() @IsString() @Length(1, 40) nickname?: string;

  @IsOptional() @StrictValue() @IsBoolean() active?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds?: number[];
}
export class ResetDto {
  @StrictValue() @IsString() @Length(10, 128) password: string;
}
export class RoleDto {
  @StrictValue() @IsString() @Matches(/^[a-z][a-z0-9_-]{1,31}$/) code: string;

  @StrictValue() @IsString() @Length(1, 64) name: string;

  @IsOptional() @StrictValue() @IsString() @Length(0, 64) description?: string;

  @IsArray() @ArrayUnique() @IsString({ each: true }) permissions: string[];
}
