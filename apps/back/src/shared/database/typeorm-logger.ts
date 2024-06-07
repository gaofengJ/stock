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
  logQuery(query: string, parameters?: any[]) {
    if (!this.isEnable('query')) return;

    const sql =
      query +
      (parameters?.length
        ? ` -- PARAMETERS: ${this.stringifyParams(parameters)}`
        : '');

    this.logger.log(`[QUERY]: ${sql}`);
  }

  /**
   * 记录数据库查询错误日志
   */
  logQueryError(error: string | Error, query: string, parameters?: any[]) {
    if (!this.isEnable('error')) return;

    const sql =
      query +
      (parameters?.length
        ? ` -- PARAMETERS: ${this.stringifyParams(parameters)}`
        : '');

    this.logger.error([`[FAILED QUERY]: ${sql}`, `[QUERY ERROR]: ${error}`]);
  }

  /**
   * 记录数据库查询慢日志
   */
  logQuerySlow(time: number, query: string, parameters?: any[]) {
    const sql =
      query +
      (parameters?.length
        ? ` -- PARAMETERS: ${this.stringifyParams(parameters)}`
        : '');

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
  private stringifyParams(parameters: any[]) {
    try {
      return JSON.stringify(parameters);
    } catch (error) {
      // 处理可能包含循环对象的参数
      return parameters;
    }
  }

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
