import { ConfigType, registerAs } from '@nestjs/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import { EGlobalConfig } from '@/types/common.enum';
import {
  getEnvConfigBoolean,
  getEnvConfigNumber,
  getEnvConfigString,
} from '@/utils';

dotenv.config({ path: `.env.${process.env.NODE_ENV}` });

// 当前通过 npm scripts 执行的命令
const currentScript = process.env.npm_lifecycle_event;

const dataSourceOptions: DataSourceOptions = {
  type: 'mysql',
  host: getEnvConfigString('DB_HOST'),
  port: getEnvConfigNumber('DB_PORT', 3306),
  username: getEnvConfigString('DB_USERNAME'),
  password: getEnvConfigString('DB_PASSWORD'),
  database: getEnvConfigString('DB_DATABASE'),
  synchronize: getEnvConfigBoolean('DB_SYNCHRONIZE', false),
  // 解决通过 pnpm migration:run 初始化数据时，遇到的 SET FOREIGN_KEY_CHECKS = 0; 等语句报错问题, 仅在执行数据迁移操作时设为 true
  multipleStatements: currentScript === 'typeorm', // 是否允许在单个查询中执行多个 SQL 语句
  entities: ['dist/modules/**/*.entity{.ts,.js}'], // 指定实体类的位置，TypeORM 将在这些路径中查找实体类
  migrations: ['dist/migrations/*{.ts,.js}'], // 指定迁移文件的位置，TypeORM 将在这些路径中查找迁移文件
  subscribers: ['dist/modules/**/*.subscriber{.ts,.js}'], // 指定订阅者的位置，TypeORM 将在这些路径中查找订阅者
};

export const DatabaseConfig = registerAs(
  EGlobalConfig.DATABASE_CONFIG,
  (): DataSourceOptions => dataSourceOptions,
);

export type IDatabaseConfig = ConfigType<typeof DatabaseConfig>;

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
