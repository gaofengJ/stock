import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReviewDateDto } from './review.dto';

export class NotebookSaveDto extends ReviewDateDto {
  @IsOptional() @IsInt() @Min(0) generation?: number;

  @IsInt() @Min(0) @Max(1000000) revision: number;

  @IsString() @MaxLength(6500000) content: string;
}
export class NotebookVersionDto extends ReviewDateDto {
  @IsOptional() @Type(() => Number) @IsIn([0, 1]) previous?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) assetReferences?: number;

  @IsOptional() @Type(() => Number) @IsIn([0, 1]) publicationBodies?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) revision?: number;
}
export class NotebookPublishDto extends ReviewDateDto {
  @IsOptional() @IsInt() @Min(0) generation?: number;

  @IsInt() @Min(1) revision: number;

  @IsIn(['wechat', 'xueqiu']) channel: 'wechat' | 'xueqiu';

  @IsString() @MaxLength(1500) url: string;
}
