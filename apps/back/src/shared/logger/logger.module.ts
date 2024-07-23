import { Module } from '@nestjs/common';

import { LoggerService } from './logger.service';
import { LoggerController } from './logger.controller';

@Module({})
export class LoggerModule {
  static forRoot() {
    return {
      global: true,
      module: LoggerModule,
      controllers: [LoggerController],
      providers: [LoggerService],
      exports: [LoggerService],
    };
  }
}
