import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IAppConfig, ISwaggerConfig } from '@/configs';
import { EGlobalConfig } from '@/types/common.enum';
import { API_SECURITY_AUTH } from '@/constants';

export const initSwagger = async (
  app: INestApplication,
  configService: ConfigService,
) => {
  const { name } = configService.get<IAppConfig>(
    EGlobalConfig.APP_CONFIG,
  ) as IAppConfig; // 获取应用配置

  const { enable, path, version } = configService.get<ISwaggerConfig>(
    EGlobalConfig.SWAGGER_CONFIG,
  ) as ISwaggerConfig; // 获取 Swagger 配置

  if (!enable) return;

  const documentBuilder = new DocumentBuilder();
  documentBuilder
    .setTitle(name)
    .setDescription(`${name} API document`)
    .setVersion(version);

  // 添加认证信息到 Swagger 文档中
  documentBuilder.addSecurity(API_SECURITY_AUTH, {
    description: '输入令牌（Enter the token）', // 安全定义的描述信息
    type: 'http', // 认证机制的类型
    scheme: 'bearer', // 使用的认证方案，客户端需要在请求的 Authorization 头部中传递一个 Bearer Token
    bearerFormat: 'JWT', // 令牌的格式，这里令牌是一个 JWT 格式的字符串
  });

  const document = SwaggerModule.createDocument(app, documentBuilder.build(), {
    ignoreGlobalPrefix: false, // Swagger 文档将包含应用程序的全局前缀
  });

  SwaggerModule.setup(path, app, document, {
    swaggerOptions: {
      persistAuthorization: true, // 持久化认证信息
    },
  });
};
