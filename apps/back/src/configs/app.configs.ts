import { ConfigType, registerAs } from '@nestjs/config';

import { EGlobalAppConfig, EGlobalConfig } from '@/types/common.enum';
import { getEnvConfigNumber, getEnvConfigString } from '@/utils';

export const AppConfig = registerAs(EGlobalConfig.APP_CONFIG, () => ({
  name: getEnvConfigString(EGlobalAppConfig.APP_NAME),
  port: getEnvConfigNumber(EGlobalAppConfig.APP_PORT, 3000),
  baseUrl: getEnvConfigString(EGlobalAppConfig.APP_BASE_URL),
  globalPrefix: getEnvConfigString(EGlobalAppConfig.GLOBAL_PREFIX),
  locale: getEnvConfigString(EGlobalAppConfig.APP_LOCALE),
}));

export type IAppConfig = ConfigType<typeof AppConfig>;
