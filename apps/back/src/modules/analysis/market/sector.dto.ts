import { IsIn, IsOptional, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MarketQueryDto } from './market.dto';

export class SectorQueryDto extends MarketQueryDto {
  @IsOptional() @IsIn(['I', 'N']) kind: 'I' | 'N' = 'I';

  @IsOptional() @Matches(/^88[156]\d{3}\.TI$/) code?: string;

  @IsOptional() @Type(() => Number) @IsIn([1, 5, 20]) period = 1;

  @IsOptional() @MaxLength(100) override keyword?: string;
}
