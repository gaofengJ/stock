import { ConfigType, registerAs } from '@nestjs/config';

import { EGlobalConfig, EGlobalSecurityConfig } from '@/types/common.enum';
import { getEnvConfigNumber, getEnvConfigString } from '@/utils';

export const SecurityConfig = registerAs(EGlobalConfig.SECURITY_CONFIG, () => ({
  jwtSecret: getEnvConfigString(EGlobalSecurityConfig.JWT_SECRET),
  jwtExprire: getEnvConfigNumber(EGlobalSecurityConfig.JWT_EXPIRE),
  refreshTokenSecret: getEnvConfigString(
    EGlobalSecurityConfig.REFRESH_TOKEN_SECRET,
  ),
  refreshTokenExpire: getEnvConfigNumber(
    EGlobalSecurityConfig.REFRESH_TOKEN_EXPIRE,
  ),
}));

export type ISecurityConfig = ConfigType<typeof SecurityConfig>;
