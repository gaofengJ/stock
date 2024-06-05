import { ConfigType, registerAs } from '@nestjs/config';
import { getEnvConfigBoolean, getEnvConfigString } from '@/utils/env';
import { EGlobalConfig, EGlobalSwaggerConfig } from '../types/common.enum';

export const SwaggerConfig = registerAs(EGlobalConfig.SWAGGER_CONFIG, () => ({
  enable: getEnvConfigBoolean(EGlobalSwaggerConfig.SWAGGER_ENABLE),
  path: getEnvConfigString(EGlobalSwaggerConfig.SWAGGER_PATH),
  version: getEnvConfigString(EGlobalSwaggerConfig.SWAGGER_VERSION),
}));

export type ISwaggerConfig = ConfigType<typeof SwaggerConfig>;
