import { SetMetadata } from '@nestjs/common';

export const NO_TIMEOUT_INTERCEPTOR_KEY = '__NO__TIMEOUT__INTERCEPTOR';
export const NoTimeoutInterceptor = () =>
  SetMetadata(NO_TIMEOUT_INTERCEPTOR_KEY, true);
