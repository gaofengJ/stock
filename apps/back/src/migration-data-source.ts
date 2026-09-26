import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { ReliableSync1790380800000 } from './migrations/1790380800000-ReliableSync';

dotenv.config({
  path:
    process.env.APP_ENV_FILE || `.env.${process.env.NODE_ENV || 'production'}`,
});

// 迁移使用独立入口，绝不触发实体自动同步或应用定时任务。
export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  charset: 'utf8mb4_general_ci',
  timezone: 'Z',
  synchronize: false,
  migrationsRun: false,
  migrationsTransactionMode: 'none',
  migrations: [ReliableSync1790380800000],
});
