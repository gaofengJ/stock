import { applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

/**
 * 安全策略的名称
 */
export const API_SECURITY_AUTH = 'API_SECURITY_AUTH';

export function ApiSecurityAuth(): ClassDecorator & MethodDecorator {
  return applyDecorators(ApiSecurity(API_SECURITY_AUTH));
}
