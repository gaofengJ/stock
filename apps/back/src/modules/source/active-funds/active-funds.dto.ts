import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { ActiveFundsEntity } from './active-funds.entity';

export class ActiveFundsDto extends PartialType(ActiveFundsEntity) {
  @ApiProperty({ description: '游资名称' })
  @IsString()
  name: string;

  @ApiProperty({ description: '关联机构' })
  @IsString()
  orgs: string;

  @ApiProperty({ description: '说明' })
  @IsString()
  desc: string;
}

export class ActiveFundsUpdateDto extends PartialType(ActiveFundsDto) {}
