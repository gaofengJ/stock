import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { Accounts1790467200000 } from './migrations/1790467200000-Accounts';

dotenv.config({
  path:
    process.env.APP_ENV_FILE || `.env.${process.env.NODE_ENV || 'production'}`,
});
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
  migrations: [Accounts1790467200000],
  migrationsTransactionMode: 'none',
  logging: false,
});
