import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyApp } from './adapters/fastify';

import { AppModule } from './app.module';

import { EGlobalConfig } from './types/common.enum';

import { LoggerService } from './shared/logger/logger.service';
import { IAppConfig } from './configs';

/**
 * 初始化 Swagger 文档
 */
const initSwagger = (app: NestFastifyApplication) => {
  const options = new DocumentBuilder()
    .setTitle('Stock Back') // 设置文档标题
    .setDescription('Stock Back API') // 设置文档描述
    .setVersion('1.0') // 设置文档版本
    .setBasePath('api') // 设置基础路径
    .addBearerAuth() // 添加 Bearer 验证
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('/docs', app, document); // 设置 Swagger 文档路径
};

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

  initSwagger(app); // 初始化 Swagger

  await app.listen(port, '0.0.0.0', async () => {
    app.useLogger(app.get(LoggerService));
    const { pid } = process;
    const logger = new Logger('NestApplication');
    logger.log(`Server running on ${pid}`);
  });
};

bootstrap();
