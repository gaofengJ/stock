import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReviewDateDto {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
}
export class HoldingDto {
  @Matches(/^\d{6}\.(SH|SZ|BJ)$/) code: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  boughtOn?: string;

  @IsOptional() @IsNumber() @Min(0.0001) @Max(1000000) cost?: number;

  @IsOptional() @IsString() @MaxLength(300) rationale?: string;
}
export class HoldingsDto extends ReviewDateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @ArrayUnique((r: HoldingDto) => r.code)
  @ValidateNested({ each: true })
  @Type(() => HoldingDto)
  holdings: HoldingDto[];
}
