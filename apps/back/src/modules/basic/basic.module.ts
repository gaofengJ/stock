import { Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { ActiveFundsModule } from './active-funds/active-funds.module';
import { DailyModule } from './daily/daily.module';
import { StockModule } from './stock/stock.module';

const modules = [ActiveFundsModule, DailyModule, StockModule];

@Module({
  imports: [
    ...modules,
    RouterModule.register([
      {
        path: 'basic',
        // eslint-disable-next-line no-use-before-define
        module: BasicModule,
        children: [...modules],
      },
    ]),
  ],
  exports: [...modules],
})
export class BasicModule {}
