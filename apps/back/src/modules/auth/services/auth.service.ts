import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

import { ISecurityConfig, SecurityConfig } from '@/configs/security.config';
import { BizException } from '@/exceptions/biz.exception';
import { RoleService } from '@/modules/role/role.service';
import { UserService } from '@/modules/user/user.service';
import { ECustomError } from '@/types/common.enum';
import { md5 } from '@/utils/crypto.util';
import { genAuthPermissionmKey, genAuthTokenKey } from '@/utils/redis.util';

import { LoginLogService } from './login-log.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRedis() private readonly redis: Redis,
    private userService: UserService,
    private roleService: RoleService,
    private tokenService: TokenService,
    private loginLogService: LoginLogService,
    @Inject(SecurityConfig.KEY) private securityConfig: ISecurityConfig,
  ) {}

  async login(username: string, password: string, ip: string, ua: string) {
    const user = await this.userService.getUserByUsername(username);
    if (!user) {
      throw new BizException(ECustomError.USER_NOT_FOUND);
    }
    const comparePassword = md5(`${password}${user.psalt}`);
    if (user.password !== comparePassword)
      throw new BizException(ECustomError.INVALID_USERNAME_PASSWORD);

    const roles = await this.userService.getRolesByUserId(user.id);

    // 包含 accessToken 和 refreshToken
    const token = await this.tokenService.generateToken(
      user.id,
      roles.map((i) => i.roleName),
    );

    await this.redis.set(
      genAuthTokenKey(`${user.id}`), // 键名
      token.accessToken, // 键值
      'EX', // 选项，表示设置键的过期时间
      this.securityConfig.jwtExprire, // 过期时间，单位: s
    );

    // 设置用户权限
    const permissions = await this.roleService.getPermissionsByRoles(
      roles.map((i) => i.id),
    );
    await this.setRedisPermissions(
      user.id,
      permissions.map((i) => i.permissionName),
    );

    await this.loginLogService.create(user.id, ip, ua);

    return token.accessToken;
  }

  async setRedisPermissions(userId: number, permissions: string[]) {
    await this.redis.set(
      genAuthPermissionmKey(`${userId}`),
      JSON.stringify(permissions),
    );
  }
}
