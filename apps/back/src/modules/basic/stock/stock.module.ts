import { Module } from '@nestjs/common';

import { StockController } from './stock.controller';
import { StockService } from './stock.service';

const services = [StockService];

@Module({
  controllers: [StockController],
  providers: [...services],
  exports: [...services],
})
export class StockModule {}
