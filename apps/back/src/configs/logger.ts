import { ConfigType, registerAs } from '@nestjs/config';
import { EGlobalConfig } from '../types/common.enum';

export const LoggerConfig = registerAs(EGlobalConfig.LOGGER_CONFIG, () => ({
  level: 'debug',
  maxFiles: 5,
}));

export type ILoggerConfig = ConfigType<typeof LoggerConfig>;
