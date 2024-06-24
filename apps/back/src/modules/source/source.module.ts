import { DynamicModule, Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { DailyModule } from './daily/daily.module';
import { LimitModule } from './limit/limit.module';
import { StockModule } from './stock/stock.module';
import { TradeCalModule } from './trade-cal/trade-cal.module';

const modules = [DailyModule, LimitModule, StockModule, TradeCalModule];

@Module({})
export class SourceModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      imports: [
        ...modules,
        RouterModule.register([
          {
            path: 'source',
            module: SourceModule,
            children: [...modules],
          },
        ]),
      ],
      module: SourceModule,
      exports: [...modules],
    };
  }
}
