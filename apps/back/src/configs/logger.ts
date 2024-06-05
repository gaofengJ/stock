import { ConfigType, registerAs } from '@nestjs/config';
import { EGlobalConfig, EGlobalLoggerConfig } from '@/types/common.enum';
import { getEnvConfigNumber, getEnvConfigString } from '@/utils/env';

export const LoggerConfig = registerAs(EGlobalConfig.LOGGER_CONFIG, () => ({
  level: getEnvConfigString(EGlobalLoggerConfig.LOGGER_LEVEL),
  maxFiles: getEnvConfigNumber(EGlobalLoggerConfig.LOGGER_MAX_FILES, 5),
}));

export type ILoggerConfig = ConfigType<typeof LoggerConfig>;
