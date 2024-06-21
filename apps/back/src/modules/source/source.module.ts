import { Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { DailyModule } from './daily/daily.module';
import { LimitModule } from './limit/limit.module';
import { StockModule } from './stock/stock.module';
import { TradeCalModule } from './trade-cal/trade-cal.module';

const modules = [DailyModule, LimitModule, StockModule, TradeCalModule];

@Module({
  imports: [
    ...modules,
    RouterModule.register([
      {
        path: 'source',
        // eslint-disable-next-line no-use-before-define
        module: SourceModule,
        children: [...modules],
      },
    ]),
  ],
  exports: [...modules],
})
export class SourceModule {}
