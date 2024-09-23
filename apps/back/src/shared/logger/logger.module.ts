import { Module } from '@nestjs/common';

import { LoggerController } from './logger.controller';
import { LoggerService } from './logger.service';

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
