import * as path from 'path';

import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  HttpStatus,
  Logger,
  UnprocessableEntityException,
  ValidationPipe,
} from '@nestjs/common';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { fastifyApp } from '@/adapters/fastify.adapters';
import { AppModule } from '@/app.module';
import { EGlobalConfig } from '@/types/common.enum';
import { LoggerService } from '@/shared/logger/logger.service';
import { IAppConfig } from '@/configs';
import { initSwagger } from '@/swagger';
import { isDev } from '@/utils';
import { validationMessage } from '@/filters/error-message';
import { registerAccessLogging } from '@/shared/logger/access-log';
import { AccessLogService } from '@/shared/logger/access-log.service';

/**
 * @description 初始化应用
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
  const accessLogger = app.get(AccessLogService);
  registerAccessLogging(
    fastifyApp.getInstance(),
    (entry) => accessLogger.write(entry),
    `/${globalPrefix.replace(/^\/+|\/+$/g, '')}`,
  );

  const origins = (
    process.env.AUTH_ALLOWED_ORIGINS ||
    'http://localhost:8081,http://127.0.0.1:8081'
  )
    .split(',')
    .map((s) => s.trim());
  if (
    process.env.NODE_ENV === 'production' &&
    !process.env.AUTH_ALLOWED_ORIGINS
  )
    throw new Error('AUTH_ALLOWED_ORIGINS is required in production');
  app.enableCors({
    origin: origins,
    credentials: true,
    exposedHeaders: ['X-Request-ID'],
  });
  app.setGlobalPrefix(globalPrefix); // 设置全局前缀
  app.useStaticAssets({ root: path.join(__dirname, '..', 'public') });

  // 开发环境正常退出时也要关闭 TypeORM 连接池，释放共享测试账号的连接。
  app.enableShutdownHooks();

  // 设置全局管道
  app.useGlobalPipes(
    // NestJS 提供的内置验证管道，用于验证和转换请求数据
    new ValidationPipe({
      transform: true, // 启用自动转换功能。比如，将请求中的字符串转换为期望的类型（如数字、布尔值等）
      whitelist: true, // 启用白名单验证。只有在 DTO（数据传输对象）中定义的属性才会被保留，其他属性会被剔除。
      transformOptions: { enableImplicitConversion: true }, // 启用隐式类型转换
      forbidNonWhitelisted: true, // 禁止无装饰器验证的数据通过
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY, // 将验证错误的 HTTP 状态码设置为 422 Unprocessable Entity
      stopAtFirstError: true, // 一旦发现第一个验证错误，就停止进一步的验证
      // 自定义异常工厂，用于生成验证错误时抛出的异常
      exceptionFactory: (errors) =>
        // 创建一个 UnprocessableEntityException 异常，并返回第一个验证错误的消息
        new UnprocessableEntityException(validationMessage(errors)),
    }),
  );

  // 开发环境中初始化 Swagger
  if (isDev) {
    initSwagger(app, configService); // 初始化 Swagger
  }

  await app.listen(port, '0.0.0.0', async () => {
    app.useLogger(app.get(LoggerService)); // 设置应用程序的日志记录器为 LoggerService 实例

    const url = await app.getUrl(); // 获取应用的 URL 地址
    const { pid } = process; // 获取进程id（pid）

    const logger = new Logger('NestApplication'); // 创建一个名为 'NestApplication' 的日志记录器实例
    logger.log(`${pid} Server running on ${url}`);
  });
};

bootstrap();
