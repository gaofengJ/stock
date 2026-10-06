import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  Matches,
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
} from 'class-validator';
import { EStrategyType } from './strategy.enum';
import {
  MARKET_SCOPES,
  MarketScope,
} from '../analysis/market/market.constants';

export class InsightDateDto {
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
}
export class CandidateDetailsDto extends InsightDateDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMaxSize(6000)
  @ArrayUnique()
  @Matches(/^\d{6}\.(SH|SZ|BJ)$/, { each: true })
  codes: string[];
}
export class CandidateFinancialDto extends InsightDateDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Matches(/^\d{6}\.(SH|SZ|BJ)$/, { each: true })
  codes: string[];
}
export class PopularityDto extends InsightDateDto {
  @IsOptional() @Matches(/^\d{6}\.(SH|SZ|BJ)$/) code?: string;
}
export class ExtremesDto extends InsightDateDto {
  @IsOptional() @IsIn(MARKET_SCOPES) scope: MarketScope = 'all';

  @IsOptional() @Type(() => Number) @IsIn([20, 60]) period = 20;

  @IsOptional() @Type(() => Number) @IsIn([20, 60]) days = 60;
}
export class PerformanceDto extends InsightDateDto {
  @IsEnum(EStrategyType) strategyType: string;

  @IsOptional() @Type(() => Number) @IsIn([20, 60]) days = 20;

  @IsOptional() @Matches(/^88[156]\d{3}\.TI$/) sector?: string;
}
