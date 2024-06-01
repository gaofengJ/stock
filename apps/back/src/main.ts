import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { fastifyApp } from './adapters/fastify';

import { AppModule } from './app.module';

import { EGlobalConfig } from './types/common.enum';

import { LoggerService } from './shared/logger/logger.service';

/**
 * 初始化 Swagger 文档
 */
const initSwagger = (app: NestFastifyApplication) => {
  const options = new DocumentBuilder()
    .setTitle('Stock Back')
    .setDescription('Stock Back API')
    .setVersion('1.0')
    .setBasePath('api')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, options);
  SwaggerModule.setup('/docs', app, document);
};

/**
 * 初始化应用
 */
const bootstrap = async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyApp,
    {
      bufferLogs: true,
      snapshot: true,
    },
  );

  const configService = app.get(ConfigService);

  const { port, globalPrefix } = configService.get(EGlobalConfig.APP_CONFIG);

  app.enableCors({ origin: '*', credentials: true });
  app.setGlobalPrefix(globalPrefix);

  initSwagger(app);

  await app.listen(port, '0.0.0.0', async () => {
    app.useLogger(app.get(LoggerService));
    const { pid } = process;
    const logger = new Logger('NestApplication');
    logger.log(`Server running on ${pid}`);
  });
};

bootstrap();
