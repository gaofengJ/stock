import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class NewsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) pageSize = 20;

  @IsOptional() @IsString() @MaxLength(16) source?: string;

  @IsOptional() @IsIn(['flash', 'article']) kind?: string;

  @IsOptional() @IsString() @MaxLength(80) keyword?: string;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;

  @IsOptional() @IsIn(['true', 'false']) important?: string;

  @IsOptional() @IsIn(['true', 'false']) favorites?: string;
}
export class NewsSourceUpdate {
  @IsOptional()
  @Transform(({ obj }) => obj.enabled)
  @IsBoolean()
  enabled?: boolean;

  @IsOptional() @IsInt() @Min(60) @Max(3600) intervalSeconds?: number;
}
