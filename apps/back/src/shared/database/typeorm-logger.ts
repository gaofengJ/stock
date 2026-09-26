import { Logger } from '@nestjs/common';
import { Logger as ITypeORMLogger, LoggerOptions } from 'typeorm';

/**
 * 自定义 TypeORM 日志记录器
 */
export class TypeORMLogger implements ITypeORMLogger {
  private logger = new Logger(TypeORMLogger.name);

  constructor(private options: LoggerOptions) {}

  /**
   * 记录数据库查询日志
   */
  logQuery(query: string) {
    if (!this.isEnable('query')) return;

    const sql = /t_(auth|user|role|permission)/i.test(query)
      ? '[account query redacted]'
      : query;

    this.logger.log(`[QUERY]: ${sql}`);
  }

  /**
   * 记录数据库查询错误日志
   */
  logQueryError(error: string | Error, query: string) {
    if (!this.isEnable('error')) return;

    const sql = /t_(auth|user|role|permission)/i.test(query)
      ? '[account query redacted]'
      : query;

    this.logger.error([
      `[FAILED QUERY]: ${sql}`,
      '[QUERY ERROR]: database operation failed (parameters omitted)',
    ]);
  }

  /**
   * 记录数据库查询慢日志
   */
  logQuerySlow(time: number, query: string) {
    const sql = /t_(auth|user|role|permission)/i.test(query)
      ? '[account query redacted]'
      : query;

    this.logger.warn(`[SLOW QUERY: ${time} ms]: ${sql}`);
  }

  /**
   * 记录数据库模式构建日志
   */
  logSchemaBuild(message: string) {
    if (!this.isEnable('schema')) return;

    this.logger.log(message);
  }

  /**
   * 记录数据库迁移日志
   */
  logMigration(message: string) {
    if (!this.isEnable('migration')) return;

    this.logger.log(message);
  }

  /**
   * 记录通用日志
   */
  log(level: 'warn' | 'info' | 'log', message: any) {
    if (!this.isEnable(level)) return;

    switch (level) {
      case 'log':
        this.logger.debug(message);
        break;
      case 'info':
        this.logger.log(message);
        break;
      case 'warn':
        this.logger.warn(message);
        break;
      default:
        break;
    }
  }

  /**
   * 转换参数为字符串
   */

  /**
   * 检查日志是否启用
   */
  private isEnable(
    level: 'query' | 'schema' | 'error' | 'warn' | 'info' | 'log' | 'migration',
  ): boolean {
    return (
      this.options === 'all' ||
      this.options === true ||
      (Array.isArray(this.options) && this.options.includes(level))
    );
  }
}
