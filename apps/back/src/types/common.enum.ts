/**
 * 全局配置 Key 的枚举
 */
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

/**
 * 全局配置-应用配置
 */
export enum EGlobalAppConfig {
  /**
   * 应用名称
   */
  APP_NAME = 'APP_NAME',
  /**
   * 应用端口
   */
  APP_PORT = 'APP_PORT',
  /**
   * 应用基础 URL
   */
  APP_BASE_URL = 'APP_BASE_URL',
  /**
   * 全局前缀
   */
  GLOBAL_PREFIX = 'GLOBAL_PREFIX',
  /**
   * 应用区域设置
   */
  APP_LOCALE = 'APP_LOCALE',
}

/**
 * 全局配置-数据库配置
 */
export enum EGlobalDatabaseConfig {
  /**
   * 数据库主机地址
   * 数据库服务器的主机名或 IP 地址
   */
  DB_HOST = 'DB_HOST',
  /**
   * 数据库端口
   */
  DB_PORT = 'DB_PORT',
  /**
   * 数据库名称
   */
  DB_DATABASE = 'DB_DATABASE',
  /**
   * 数据库用户名
   */
  DB_USERNAME = 'DB_USERNAME',
  /**
   * 数据库密码
   */
  DB_PASSWORD = 'DB_PASSWORD',
  /**
   * 是否同步数据库
   * 决定 TypeORM 是否在每次应用启动时自动同步数据库架构
   */
  DB_SYNCHRONIZE = 'DB_SYNCHRONIZE',
  /**
   * 数据库日志记录
   * 定义数据库操作的日志记录选项，可以是布尔值或详细的日志级别配置
   */
  DB_LOGGING = 'DB_LOGGING',
}

/**
 * 全局配置-tushare配置
 */
export enum EGlobalTushareConfig {
  /**
   * tushare token
   */
  TUSHARE_CONF_TOKEN = 'TUSHARE_CONF_TOKEN',
}

/**
 * 全局配置-日志配置
 */
export enum EGlobalLoggerConfig {
  /**
   * 日志级别
   */
  LOGGER_LEVEL = 'LOGGER_LEVEL',
  /**
   * 最大日志文件数配置
   */
  LOGGER_MAX_FILES = 'LOGGER_MAX_FILES',
}

/**
 * 全局配置-Redis配置
 */
export enum EGlobalRedisConfig {}

/**
 * 全局配置-Swagger配置
 */
export enum EGlobalSwaggerConfig {
  /**
   * 是否开启
   */
  SWAGGER_ENABLE = 'SWAGGER_ENABLE',
  /**
   * 访问路径
   */
  SWAGGER_PATH = 'SWAGGER_PATH',
  /**
   * 版本号设置
   */
  SWAGGER_VERSION = 'SWAGGER_VERSION',
}

/**
 * 不同日志级别的枚举
 */
export enum ELogLevel {
  /**
   * 错误级别的消息
   * 严重问题，需要立即处理
   */
  ERROR = 'error',
  /**
   * 警告级别的消息
   * 潜在问题或需要监控的问题
   */
  WARN = 'warn',
  /**
   * 信息级别的消息
   * 记录应用程序操作的一半信息
   */
  INFO = 'info',
  /**
   * 调试级别的消息
   * 用于调试目的，通常包含更详细的信息
   */
  DEBUG = 'debug',
  /**
   * 详细级别的消息
   * 非常详细的信息，通常过于冗长，不适用于大多数情况
   */
  VERBOSE = 'verbose',
}

/**
 * 数据类型
 */
export enum EType {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  object = 'object',
  array = 'array',
  function = 'function',
  null = 'null',
  undefined = 'undefined',
  regexp = 'regexp',
  date = 'date',
}

export enum CustomErrorEnum {
  SERVER_ERROR = '500:服务繁忙，请稍后再试',
}
