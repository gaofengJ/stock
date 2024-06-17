import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource, DataSourceOptions, LoggerOptions } from 'typeorm';

import { IDatabaseConfig } from '@/configs/database.configs';
import { EGlobalConfig, EGlobalDatabaseConfig } from '@/types/common.enum';
import { getEnvConfigString } from '@/utils';
import { DataSourceService } from './database.service';

import { EntityExistConstraint } from './constraints/entity-exist.constraint';
import { UniqueConstraint } from './constraints/unique.constraint';
import { TypeORMLogger } from './typeorm-logger';
import { ClsServiceStatic } from './cls.service';
import { IsEnumConstraint } from './constraints/is-enum.constraint';

const providers = [
  DataSourceService,
  ClsServiceStatic,
  EntityExistConstraint,
  IsEnumConstraint,
  UniqueConstraint,
];

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
          autoLoadEntities: true, // 自动加载所有定义的实体，无需在配置中手动指定每个实体
          logging: loggerOptions, // 控制日志记录的详细程度
          logger: new TypeORMLogger(loggerOptions), // 日志记录器
        };
      },
      // 初始化数据源
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
