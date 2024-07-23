import * as path from 'path';
import * as fs from 'fs';
import * as dayjs from 'dayjs';
import {
  ConsoleLogger,
  ConsoleLoggerOptions,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger as WinstonLogger } from 'winston';
import { config, createLogger, format, transports } from 'winston';
import 'winston-daily-rotate-file';

import { ILoggerConfig } from '@/configs/logger.configs';
import { EGlobalConfig, ELogLevel } from '@/types/common.enum';
import { loggerQueryDto } from './logger.dto';

@Injectable()
export class LoggerService extends ConsoleLogger {
  private winstonLogger: WinstonLogger;

  /**
   * 构造函数，初始化日志服务
   * @param context 日志的上下文信息
   * @param options 日志选项
   * @param configService 配置服务，用于获取日志相关配置
   */
  constructor(
    context: string,
    options: ConsoleLoggerOptions,
    private configService: ConfigService<keyof typeof EGlobalConfig>,
  ) {
    super(context, options); // // 调用父类的构造函数，初始化 ConsoleLogger
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

  /**
   * 初始化 winston 日志记录器
   */
  protected initWinston() {
    this.winstonLogger = createLogger({
      levels: config.npm.levels, // 指定不同日志级别的优先级
      format: format.combine(
        format.errors({ stack: true }), // 记录错误信息和堆栈
        format.timestamp(), // 添加时间戳
        format.json(), // 将日志消息格式化为 JSON 格式
      ),
      // 日志传输机制的配置项，用于指定日志的输出目的地
      transports: [
        new transports.DailyRotateFile({
          level: this.level,
          filename: 'logs/stock-back.%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: this.maxFiles,
          format: format.combine(format.timestamp(), format.json()),
          auditFile: 'logs/.audit/stock-back.json',
        }),
        new transports.DailyRotateFile({
          level: ELogLevel.ERROR,
          filename: 'logs/stock-back-error.%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxFiles: this.maxFiles,
          format: format.combine(format.timestamp(), format.json()),
          auditFile: 'logs/.audit/stock-back-error.json',
        }),
      ],
    });
  }

  /**
   * 记录 verbose 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  verbose(message: any, context?: string) {
    super.verbose.apply(this, [message, context]);
    this.winstonLogger.log(ELogLevel.VERBOSE, message, { context });
  }

  /**
   * 记录 debug 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  debug(message: any, context?: string) {
    super.debug.apply(this, [message, context]);
    this.winstonLogger.log(ELogLevel.DEBUG, message, { context });
  }

  /**
   * 记录 info 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  log(message: any, context?: string) {
    super.log.apply(this, [message, context]);

    this.winstonLogger.log(ELogLevel.INFO, message, { context });
  }

  /**
   * 记录 warn 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  warn(message: any, context?: string) {
    super.warn.apply(this, [message, context]);

    this.winstonLogger.log(ELogLevel.WARN, message);
  }

  /**
   * 记录 error 级别的日志
   * @param message 日志消息
   * @param context 日志的上下文信息
   */
  error(message: any, stack?: string, context?: string) {
    super.error.apply(this, [message, stack, context]);

    const hasStack = !!context;
    this.winstonLogger.log(ELogLevel.ERROR, {
      context: hasStack ? context : stack,
      message: hasStack ? new Error(message) : message,
    });
  }

  /**
   * 获取日志列表
   */
  list(dto: loggerQueryDto) {
    const { startDate, endDate, loggerType } = dto;

    let list: string[] = [];

    // 定义日志文件夹路径
    const logsDir = path.join(__dirname, '../../../logs');
    // 根据 loggerType 确定文件名前缀
    const fileNamePrefix =
      loggerType === 'error' ? 'stock-back-error' : 'stock-back';

    const start = dayjs(startDate);
    const end = dayjs(endDate);
    let cur = start;
    // 遍历日期范围内的每一天
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      // 生成当前日期的日志文件路径
      const filePath = path.join(
        logsDir,
        `${fileNamePrefix}.${cur.format('YYYY-MM-DD')}.log`,
      );
      // 如果文件不存在，跳过
      if (!fs.existsSync(filePath)) {
        cur = cur.add(1, 'day');
        // eslint-disable-next-line no-continue
        continue;
      }
      // 更新 cur 日期
      cur = cur.add(1, 'day');
      // 读取文件内容并按行分割
      const curList = fs
        .readFileSync(filePath, 'utf8')
        .split('\n')
        .filter((line) => line.trim());

      list = [...list, ...curList];
    }

    return list;
  }
}
