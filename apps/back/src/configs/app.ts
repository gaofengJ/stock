import { ConfigType, registerAs } from '@nestjs/config';
import { EGlobalConfig } from '../types/common.enum';

export const AppConfig = registerAs(EGlobalConfig.APP_CONFIG, () => ({
  name: 'STOCK_BACK',
  port: 3000,
  baseUrl: '',
  globalPrefix: 'api',
  locale: 'zh-CN',
}));

export type IAppConfig = ConfigType<typeof AppConfig>;
