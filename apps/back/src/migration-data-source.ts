import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { ReliableSync1790380800000 } from './migrations/1790380800000-ReliableSync';
import { SyncSafety1790380800001 } from './migrations/1790380800001-SyncSafety';
import { Accounts1790467200000 } from './migrations/1790467200000-Accounts';
import { AccountAvatars1790467200001 } from './migrations/1790467200001-AccountAvatars';
import { MarketAnalysis1790553600000 } from './migrations/1790553600000-MarketAnalysis';
import { LoginActivity1790640000000 } from './migrations/1790640000000-LoginActivity';
import { DragonPermission1790812800000 } from './migrations/1790812800000-DragonPermission';
import { RealTimeNews1790812800001 } from './migrations/1790812800001-RealTimeNews';
import { ExpandedNewsSources1790832000000 } from './migrations/1790832000000-ExpandedNewsSources';
import { NewsDisplayPolicy1790835600000 } from './migrations/1790835600000-NewsDisplayPolicy';
import { MarketBreadth1790899200000 } from './migrations/1790899200000-MarketBreadth';
import { ThsSectors1790985600000 } from './migrations/1790985600000-ThsSectors';
import { NewsTranslations1791072000000 } from './migrations/1791072000000-NewsTranslations';
import { NewsReadingFeatures1791158400000 } from './migrations/1791158400000-NewsReadingFeatures';
import { StockIdentity1791244800000 } from './migrations/1791244800000-StockIdentity';

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
  migrations: [
    ReliableSync1790380800000,
    SyncSafety1790380800001,
    Accounts1790467200000,
    AccountAvatars1790467200001,
    MarketAnalysis1790553600000,
    LoginActivity1790640000000,
    DragonPermission1790812800000,
    RealTimeNews1790812800001,
    ExpandedNewsSources1790832000000,
    NewsDisplayPolicy1790835600000,
    MarketBreadth1790899200000,
    ThsSectors1790985600000,
    NewsTranslations1791072000000,
    NewsReadingFeatures1791158400000,
    StockIdentity1791244800000,
  ],
  migrationsTransactionMode: 'none',
  logging: false,
});
