import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions, LoggerOptions } from 'typeorm';

import { IDatabaseConfig } from '@/configs/database.configs';
import { EGlobalConfig, EGlobalDatabaseConfig } from '@/types/common.enum';
import { getEnvConfigString } from '@/utils';

import { EntityExistConstraint } from './constraints/entity-exist.constraint';
import { UniqueConstraint } from './constraints/unique.constraint';
import { TypeORMLogger } from './typeorm-logger';

const providers = [EntityExistConstraint, UniqueConstraint];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService], // 指定了在 useFactory 中使用的依赖项，即 ConfigService
      useFactory: (
        configService: ConfigService<keyof typeof EGlobalConfig>,
      ) => {
        let loggerOptions: LoggerOptions = getEnvConfigString(
          EGlobalDatabaseConfig.DB_LOGGING,
        ) as 'all';

        try {
          loggerOptions = JSON.parse(loggerOptions); // 解析成 js 数组 ['error']
        } catch (e) {
          // ignore
        }

        return {
          ...(configService.get<IDatabaseConfig>(
            EGlobalConfig.DATABASE_CONFIG,
            {
              infer: true,
            },
          ) as IDatabaseConfig),
          autoLoadEntities: true,
          logging: loggerOptions,
          logger: new TypeORMLogger(loggerOptions),
        };
      },
      // dataSource receives the configured DataSourceOptions
      // and returns a Promise<DataSource>.
      dataSourceFactory: async (options: DataSourceOptions) => {
        const dataSource = await new DataSource(options).initialize();
        return dataSource;
      },
    }),
  ],
  providers,
  exports: providers,
})
export class DatabaseModule {}
