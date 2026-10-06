import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { AVATARS } from './avatar';

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
  @Transform(({ obj, key }) =>
    typeof obj[key] === 'string' ? obj[key].trim() || undefined : obj[key],
  )
  @IsString()
  @Length(1, 40, { message: '昵称长度为1至40个字符' })
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
  @ValidateIf((_, value) => value !== undefined)
  @StrictValue()
  @IsString()
  @Length(1, 40)
  nickname?: string;

  @ValidateIf((_, value) => value !== undefined)
  @StrictValue()
  @IsIn(AVATARS, { message: '请选择有效的小牛头像' })
  avatar?: string;
}
export class PageDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;

  @IsOptional() @StrictValue() @IsString() @Length(0, 100) keyword?: string;
}
export class UserQueryDto extends PageDto {
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) active?: number;
}
export class ActivityQueryDto extends PageDto {
  @IsOptional() @IsIn(['read', 'unread']) status?: 'read' | 'unread';

  @IsOptional() @IsIn(['login', 'register']) event?: 'login' | 'register';

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  endDate?: string;
}
export class ReadActivityDto {
  @StrictValue()
  @IsInt({ message: '请选择有效的登录记录' })
  @Min(0)
  @Max(2147483647)
  throughId: number;
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
