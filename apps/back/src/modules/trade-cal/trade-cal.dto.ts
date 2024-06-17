import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNumber, IsString } from 'class-validator';
import { IsUnique } from '@/shared/database/constraints/unique.constraint';
import { PagerDto } from '@/dto/pager.dto';
import { TradeCalEntity } from './trade-cal.entity';
import { EIsOpen } from './trade-cal.enum';

export class TradeCalDto extends PartialType(TradeCalEntity) {
  @ApiProperty({ description: '日期' })
  @IsUnique({
    entity: TradeCalEntity,
    message: '已存在相同名称的日期',
  })
  @IsDate()
  tsCode: string;

  @ApiProperty({ description: '是否为交易日期 0: 否 1: 是' })
  @IsEnum(EIsOpen)
  isOpen: number;

  @ApiProperty({ description: '上一个交易日期' })
  @IsDate()
  preTradeDate: string;
}

export class TradeCalQueryDto extends PagerDto {
  @ApiProperty({ description: '日期' })
  @IsString()
  calDate?: string;

  @ApiProperty({ description: '是否为交易日期' })
  @IsNumber()
  isOpen?: number;
}

export class TradeCalUpdateDto extends PartialType(TradeCalDto) {}
