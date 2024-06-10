import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity } from 'typeorm';
import { CommonEntity } from '@/entity/common.entity';

@Entity('t_stock_basic')
export class StockBasicEntity extends CommonEntity {
  @Column()
  @ApiProperty({ description: 'stock-basic' })
  value: string;

  @Column({ default: '' })
  @ApiProperty({ description: 'stock-basic' })
  status: boolean;
}
