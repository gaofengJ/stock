import { ConfigType, registerAs } from '@nestjs/config';
import { EGlobalConfig } from '../types/common.enum';

export const SwaggerConfig = registerAs(EGlobalConfig.SWAGGER_CONFIG, () => ({
  enable: 'TRUE',
}));

export type ISwaggerConfig = ConfigType<typeof SwaggerConfig>;
