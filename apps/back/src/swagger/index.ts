import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IAppConfig, ISwaggerConfig } from '@/configs';
import { EGlobalConfig } from '@/types/common.enum';
import { API_SECURITY_AUTH } from '@/constants/swagger';

export const initSwagger = (
  app: INestApplication,
  configService: ConfigService,
) => {
  const { name, port } = configService.get<IAppConfig>(
    EGlobalConfig.APP_CONFIG,
  ) as IAppConfig;
  const { enable, path, version } = configService.get<ISwaggerConfig>(
    EGlobalConfig.SWAGGER_CONFIG,
  ) as ISwaggerConfig;

  if (!enable) return;
  const documentBuilder = new DocumentBuilder();
  documentBuilder
    .setTitle(name)
    .setDescription(`${name} API document`)
    .setVersion(version);

  // Auth Security
  documentBuilder.addSecurity(API_SECURITY_AUTH, {
    description: '输入令牌（Enter the token）',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const document = SwaggerModule.createDocument(app, documentBuilder.build(), {
    ignoreGlobalPrefix: false,
    // extraModels: [CommonEntity, ResOp, Pagination, TreeResult]
  });

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  // log
  const logger = new Logger('SwaggerModule');
  logger.log(`Document running on http://127.0.0.1:${port}/${path}`);
};
