import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StockEntity } from './stock.entity';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

const services = [StockService];

@Module({
  imports: [TypeOrmModule.forFeature([StockEntity])],
  controllers: [StockController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class StockModule {}
