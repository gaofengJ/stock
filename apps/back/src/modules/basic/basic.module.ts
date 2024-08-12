import { Module } from '@nestjs/common';

import { RouterModule } from '@nestjs/core';

import { DailyModule } from './daily/daily.module';
import { StockModule } from './stock/stock.module';

const modules = [DailyModule, StockModule];

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
