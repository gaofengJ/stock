/* eslint-disable no-shadow */
export enum EGlobalConfig {
  /**
   * 应用配置
   */
  APP_CONFIG = 'APP_CONFIG',
  /**
   * 数据库配置
   */
  DATABASE_CONFIG = 'DATABASE_CONFIG',
  /**
   * 日志配置
   */
  LOGGER_CONFIG = 'LOGGER_CONFIG',
  /**
   * Redis 配置
   */
  REDIS_CONFIG = 'REDIS_CONFIG',
  /**
   * Swagger 配置
   */
  SWAGGER_CONFIG = 'SWAGGER_CONFIG',
}

export enum ELogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  VERBOSE = 'verbose',
}
