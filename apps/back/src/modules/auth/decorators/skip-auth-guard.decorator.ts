import { SetMetadata } from '@nestjs/common';

import { SKIP_AUTH_GUARD_KEY } from '../auth.constant';

/**
 * 当接口不需要检测用户是否具有操作权限时添加该装饰器
 */
export const SkipAuthGuard = () => SetMetadata(SKIP_AUTH_GUARD_KEY, true);
