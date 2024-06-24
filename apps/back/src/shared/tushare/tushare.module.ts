import { Module } from '@nestjs/common';

import { TushareService } from './tushare.service';

@Module({})
export class TushareModule {
  static forRoot() {
    return {
      global: true,
      module: TushareModule,
      providers: [TushareService],
      exports: [TushareService],
    };
  }
}
