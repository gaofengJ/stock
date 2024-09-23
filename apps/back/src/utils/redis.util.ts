import { RedisKeys } from '@/constants/redis.constant';

/**
 * 生成验证码 redis key
 */
export function genCaptchaImgKey(val: string) {
  return `${RedisKeys.CAPTCHA_IMG_PREFIX}${val}` as const;
}

/**
 * 生成 auth token redis key
 */
export function genAuthTokenKey(val: string) {
  return `${RedisKeys.AUTH_TOKEN_PREFIX}${val}` as const;
}
/**
 * 生成 auth permission redis key
 */
export function genAuthPermissionmKey(val: string) {
  return `${RedisKeys.AUTH_PERMISSION_PREFIX}${val}` as const;
}

// /**
//  * 生成 online user redis key
//  */
// export function genOnlineUserKey(tokenId: string) {
//   return `${RedisKeys.ONLINE_USER_PREFIX}${tokenId}` as const;
// }

/**
 * 生成 token blacklist redis key
 */
// export function genTokenBlacklistKey(tokenId: string) {
//   return `${RedisKeys.TOKEN_BLACKLIST_PREFIX}${tokenId}` as const;
// }
