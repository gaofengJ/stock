import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class BasicTradeCalQueryDto {
  @ApiProperty({ description: '年份' })
  @IsString()
  year: string;
}
