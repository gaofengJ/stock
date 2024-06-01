import {
  ConsoleLogger,
  ConsoleLoggerOptions,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger as WinstonLogger } from 'winston';
import { config, createLogger, format } from 'winston';

import { ILoggerConfig } from '../../configs/logger';
import { EGlobalConfig, ELogLevel } from '../../types/common.enum';

@Injectable()
export class LoggerService extends ConsoleLogger {
  private winstonLogger: WinstonLogger;

  constructor(
    context: string,
    options: ConsoleLoggerOptions,
    private configService: ConfigService<keyof typeof EGlobalConfig>,
  ) {
    super(context, options);
    this.initWinston();
  }

  protected get level(): ELogLevel {
    const { level } = this.configService.get<ILoggerConfig>(
      EGlobalConfig.LOGGER_CONFIG,
      {
        infer: true,
      },
    );
    return level;
  }

  protected get maxFiles(): number {
    const { maxFiles } = this.configService.get<ILoggerConfig>(
      EGlobalConfig.LOGGER_CONFIG,
      {
        infer: true,
      },
    );
    return maxFiles;
  }

  protected initWinston(): void {
    this.winstonLogger = createLogger({
      levels: config.npm.levels,
      format: format.combine(
        format.errors({ stack: true }),
        format.timestamp(),
        format.json(),
      ),
      // transports: [
      //   new transports.DailyRotateFile({
      //     level: this.level,
      //     filename: 'logs/app.%DATE%.log',
      //     datePattern: 'YYYY-MM-DD',
      //     maxFiles: this.maxFiles,
      //     format: format.combine(format.timestamp(), format.json()),
      //     auditFile: 'logs/.audit/app.json',
      //   }),
      //   new transports.DailyRotateFile({
      //     level: ELogLevel.ERROR,
      //     filename: 'logs/app-error.%DATE%.log',
      //     datePattern: 'YYYY-MM-DD',
      //     maxFiles: this.maxFiles,
      //     format: format.combine(format.timestamp(), format.json()),
      //     auditFile: 'logs/.audit/app-error.json',
      //   }),
      // ],
    });
  }

  verbose(message: any, context?: string): void {
    super.verbose.apply(this, [message, context]);

    this.winstonLogger.log(ELogLevel.VERBOSE, message, { context });
  }

  debug(message: any, context?: string): void {
    super.debug.apply(this, [message, context]);

    this.winstonLogger.log(ELogLevel.DEBUG, message, { context });
  }

  log(message: any, context?: string): void {
    super.log.apply(this, [message, context]);

    this.winstonLogger.log(ELogLevel.INFO, message, { context });
  }

  warn(message: any, context?: string): void {
    super.warn.apply(this, [message, context]);

    this.winstonLogger.log(ELogLevel.WARN, message);
  }

  error(message: any, stack?: string, context?: string): void {
    super.error.apply(this, [message, stack, context]);

    const hasStack = !!context;
    this.winstonLogger.log(ELogLevel.ERROR, {
      context: hasStack ? context : stack,
      message: hasStack ? new Error(message) : message,
    });
  }
}
