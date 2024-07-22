import { SetMetadata } from '@nestjs/common';

export const NO_TIMEOUT_INTERCEPTOR_KEY = '__no__timeout__interceptor';
export const NoTimeoutInterceptor = () =>
  SetMetadata(NO_TIMEOUT_INTERCEPTOR_KEY, true);
