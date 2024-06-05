import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyApp } from '@/adapters/fastify';

import { AppModule } from '@/app.module';

import { EGlobalConfig } from '@/types/common.enum';

import { LoggerService } from '@/shared/logger/logger.service';
import { IAppConfig } from '@/configs';
import { initSwagger } from '@/swagger';

/**
 * 初始化应用
 */
const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyApp,
    {
      bufferLogs: true, // 缓存日志
      snapshot: true, // 启用快照功能
    },
  );

  const configService = app.get(ConfigService);

  // 从本地配置中获取端口和全局前缀
  const { port, globalPrefix } = configService.get<IAppConfig>(
    EGlobalConfig.APP_CONFIG,
  ) as IAppConfig;

  app.enableCors({ origin: '*', credentials: true }); // 启用跨域资源共享 (CORS)，允许所有来源和携带凭证
  app.setGlobalPrefix(globalPrefix); // 设置全局前缀

  initSwagger(app, configService); // 初始化 Swagger

  await app.listen(port, '0.0.0.0', async () => {
    app.useLogger(app.get(LoggerService));
    const { pid } = process;
    const logger = new Logger('NestApplication');
    logger.log(`Server running on ${pid}`);
  });
};

bootstrap();
