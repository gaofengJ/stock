import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';
import { PagerDto } from '@/dto/pager.dto';
import { StockEntity } from './stock.entity';
import { EIsHs, EListStatus, EMarket } from './stock.enum';

export class StockDto extends PartialType(StockEntity) {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsUnique({
    entity: StockEntity,
    message: '已存在相同名称的股票代码（包含交易所）',
  })
  @IsString()
  tsCode: string;

  @ApiProperty({ description: '股票代码' })
  @IsUnique({
    entity: StockEntity,
    message: '已存在相同名称的股票代码',
  })
  @IsString()
  symbol: string;

  @ApiProperty({ description: '股票名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '所在区域' })
  @IsString()
  area: string;

  @ApiProperty({ description: '所在行业' })
  @IsString()
  industry: string;

  @ApiProperty({ description: '股票全称' })
  @IsString()
  @IsOptional()
  fullname: string;

  @ApiProperty({ description: '英文全称' })
  @IsString()
  @IsOptional()
  enname: string;

  @ApiProperty({ description: '拼音缩写' })
  @IsString()
  cnspell: string;

  @ApiProperty({ description: '市场类型（主板/创业板/科创板/北交所）' })
  @IsEnum(EMarket)
  market: string;

  @ApiProperty({ description: '交易所代码' })
  @IsString()
  @IsOptional()
  exchange: string;

  @ApiProperty({ description: '交易货币' })
  @IsString()
  @IsOptional()
  currType: string;

  @ApiProperty({ description: '上市状态（L上市中 D已退市 P暂停上市）' })
  @IsEnum(EListStatus)
  @IsOptional()
  listStatus: string;

  @ApiProperty({ description: '上市日期' })
  @IsDateString()
  listDate: string;

  @ApiProperty({ description: '退市日期' })
  @IsOptional()
  @IsDateString()
  delistDate: string;

  @ApiProperty({ description: '是否沪深港通标的，N否 H沪股通 S深股通' })
  @IsEnum(EIsHs)
  @IsOptional()
  isHs: string;

  @ApiProperty({ description: '实控人名称' })
  @IsString()
  @IsOptional()
  actName: string;

  @ApiProperty({ description: '实控人企业性质' })
  @IsString()
  @IsOptional()
  actEntType: string;
}

export class StockQueryDto extends PagerDto {
  @ApiProperty({ description: '股票代码（包含交易所）' })
  @IsString()
  @IsOptional()
  tsCode?: string;

  @ApiProperty({ description: '股票名称' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: '市场类型' })
  @IsEnum(EMarket)
  @IsOptional()
  market?: string;

  @ApiProperty({ description: '上市状态' })
  @IsEnum(EListStatus)
  @IsOptional()
  listStatus?: string;

  @ApiProperty({ description: '是否沪深港通标的' })
  @IsEnum(EIsHs)
  @IsOptional()
  isHs?: string;
}

export class StockUpdateDto extends PartialType(StockDto) {}
