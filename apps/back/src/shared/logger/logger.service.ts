import * as path from 'path';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { ConsoleLogger, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger as WinstonLogger } from 'winston';
import { config, createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';

import { ILoggerConfig } from '@/configs/logger.configs';
import { EGlobalConfig, ELogLevel } from '@/types/common.enum';
import { redact } from '@/modules/auth/redact';
import { loggerQueryDto } from './logger.dto';
import { requestLogFields } from './request-context';

// 扩展 dayjs 插件
dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class LoggerService extends ConsoleLogger implements OnModuleDestroy {
  private winstonLogger: WinstonLogger;

  private lastWriteFailure = 0;

  /**
   * 构造函数，初始化日志服务
   * @param context 日志的上下文信息
   * @param options 日志选项
   * @param configService 配置服务，用于获取日志相关配置
   */
  constructor(
    private configService: ConfigService<keyof typeof EGlobalConfig>,
  ) {
    super(); // // 调用父类的构造函数，初始化 ConsoleLogger
    this.initWinston();
  }

  // protected 关键字用于指定类成员的访问权限。被 protected 修饰的成员可以在其所属类的派生类（子类）中访问，但不能在类的外部或非子类中直接访问
  protected get level(): ELogLevel {
    const { level } = this.configService.get<ILoggerConfig>(
      EGlobalConfig.LOGGER_CONFIG,
      {
        infer: true,
      },
    ) as ILoggerConfig;
    return level as ELogLevel;
  }

  protected get maxFiles(): number {
    const { maxFiles } = this.configService.get<ILoggerConfig>(
      EGlobalConfig.LOGGER_CONFIG,
      {
        infer: true,
      },
    ) as ILoggerConfig;
    return maxFiles;
  }

  protected timezoned() {
    return dayjs().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss');
  }

  /**
   * 初始化 winston 日志记录器
   */
  protected initWinston() {
    this.winstonLogger = createLogger({
      levels: config.npm.levels, // 指定不同日志级别的优先级
      format: format.combine(
        format((entry) => ({ ...entry, kind: 'system' }))(),
        format.errors({ stack: true }), // 记录错误信息和堆栈
        format.timestamp({ format: this.timezoned }), // 添加时间戳
        format.json(), // 将日志消息格式化为 JSON 格式
      ),
      // 日志传输机制的配置项，用于指定日志的输出目的地
      transports: [
        new transports.DailyRotateFile({
          level: this.level,
          filename: path.join(
            process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
            'stock-back.%DATE%.log',
          ),
          datePattern: 'YYYY-MM-DD',
          maxFiles: this.maxFiles,
          format: format.combine(
            format.timestamp({ format: this.timezoned }),
            format.json(),
          ),
          auditFile: path.join(
            process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
            '.audit/stock-back.json',
          ),
        }),
        new transports.DailyRotateFile({
          level: ELogLevel.ERROR,
          filename: path.join(
            process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
            'stock-back-error.%DATE%.log',
          ),
          datePattern: 'YYYY-MM-DD',
          maxFiles: this.maxFiles,
          format: format.combine(
            format.timestamp({ format: this.timezoned }),
            format.json(),
          ),
          auditFile: path.join(
            process.env.LOG_DIR || path.join(process.cwd(), 'logs'),
            '.audit/stock-back-error.json',
          ),
        }),
      ],
    });
    const reportFailure = () => {
      if (Date.now() - this.lastWriteFailure < 60000) return;
      this.lastWriteFailure = Date.now();
      // Do not recursively send a failed system logger back to itself.
      console.error('系统日志写入失败，请检查日志目录权限和磁盘空间');
    };
    this.winstonLogger.on('error', reportFailure);
    this.winstonLogger.transports.forEach((transport) =>
      transport.on('error', reportFailure),
    );
  }

  async onModuleDestroy() {
    await new Promise<void>((resolve) => {
      this.winstonLogger.once('finish', resolve);
      this.winstonLogger.end();
    });
    this.winstonLogger.close();
  }

  /**
   * 记录 verbose 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  verbose(message: any, context?: string) {
    const safeMessage = redact(
      message instanceof Error
        ? { message: message.message, stack: message.stack }
        : message,
    );
    super.verbose.apply(this, [safeMessage, context]);
    this.winstonLogger.log(ELogLevel.VERBOSE, safeMessage, {
      context,
      ...requestLogFields(),
    });
  }

  /**
   * 记录 debug 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  debug(message: any, context?: string) {
    const safeMessage = redact(
      message instanceof Error
        ? { message: message.message, stack: message.stack }
        : message,
    );
    super.debug.apply(this, [safeMessage, context]);
    this.winstonLogger.log(ELogLevel.DEBUG, safeMessage, {
      context,
      ...requestLogFields(),
    });
  }

  /**
   * 记录 info 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  log(message: any, context?: string) {
    const safeMessage = redact(
      message instanceof Error
        ? { message: message.message, stack: message.stack }
        : message,
    );
    super.log.apply(this, [safeMessage, context]);

    this.winstonLogger.log(ELogLevel.INFO, safeMessage, {
      context,
      ...requestLogFields(),
    });
  }

  /**
   * 记录 warn 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  warn(message: any, context?: string) {
    const safeMessage = redact(
      message instanceof Error
        ? { message: message.message, stack: message.stack }
        : message,
    );
    super.warn.apply(this, [safeMessage, context]);

    this.winstonLogger.log(ELogLevel.WARN, safeMessage, {
      context,
      ...requestLogFields(),
    });
  }

  /**
   * 记录 error 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  error(message: any, stack?: string, context?: string) {
    const safeMessage = redact(
      message instanceof Error
        ? { message: message.message, stack: message.stack }
        : message,
    );
    const safeStack = redact(stack) as string;
    super.error.apply(this, [safeMessage, safeStack, context]);

    this.winstonLogger.log(ELogLevel.ERROR, {
      ...requestLogFields(),
      context: context || safeStack,
      message: safeMessage,
      stack: context ? safeStack : undefined,
    });
  }

  /**
   * 获取日志列表
   */
  list(dto: loggerQueryDto) {
    // eslint-disable-next-line no-void -- Retain the retired service signature without reading any file.
    void dto;
    throw new Error('旧日志入口已撤下，请使用 /admin/logs');
  }
}
