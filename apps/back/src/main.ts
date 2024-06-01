import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * 初始化 Swagger 文档
 */
const initSwagger = (app: INestApplication) => {
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
  const appOptions = { cors: true };
  const app = await NestFactory.create(AppModule, appOptions);
  app.setGlobalPrefix('api');

  initSwagger(app);

  await app.listen(3000);
};

bootstrap();
