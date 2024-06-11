import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StockBasicEntity } from './stock-basic.entity';
import { StockBasicController } from './stock-basic.controller';
import { StockBasicService } from './stock-basic.service';

const services = [StockBasicService];

@Module({
  imports: [TypeOrmModule.forFeature([StockBasicEntity])],
  controllers: [StockBasicController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class StockBasicModule {}
