import { Module } from '@nestjs/common';

import { LoggerService } from './logger.service';
import { AccessLogService } from './access-log.service';

@Module({})
export class LoggerModule {
  static forRoot() {
    return {
      global: true,
      module: LoggerModule,
      controllers: [],
      providers: [LoggerService, AccessLogService],
      exports: [LoggerService, AccessLogService],
    };
  }
}
