/**
 * Redis 相关 key
 */
export enum RedisKeys {
  /**
   * 存储访问 IP 地址的 Redis 键名
   */
  ACCESS_IP = 'access_ip',
  /**
   * 存储图形验证码图片的 Redis 键前缀
   */
  CAPTCHA_IMG_PREFIX = 'captcha:img:',
  /**
   * 存储认证令牌（access token）的 Redis 键前缀
   */
  AUTH_TOKEN_PREFIX = 'auth:token:',
  /**
   * 存储用户权限信息的 Redis 键前缀
   */
  AUTH_PERMISSION_PREFIX = 'auth:permission:',
  // AUTH_PASSWORD_V_PREFIX = 'auth:passwordVersion:',
  // ONLINE_USER_PREFIX = 'online:user:',
  // TOKEN_BLACKLIST_PREFIX = 'token:blacklist:',
}
