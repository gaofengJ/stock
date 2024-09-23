import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as dayjs from 'dayjs';

import { ISecurityConfig, SecurityConfig } from '@/configs/security.config';
import { RoleService } from '@/modules/role/role.service';

import { AccessTokenEntity } from '../entities/access-token.entity';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';

/**
 * 令牌服务
 */
@Injectable()
export class TokenService {
  constructor(
    private jwtService: JwtService,
    private roleService: RoleService,
    // 这里的 SecurityConfig.KEY 是命名空间，用来告诉 NestJS 要注入的是 SecurityConfig 这个配置
    @Inject(SecurityConfig.KEY) private securityConfig: ISecurityConfig,
  ) {}

  /**
   * @description 生成 accessToken 和 refreshToken
   * @param userId
   * @param roles
   * @returns { accessToken, refreshToken }
   */
  async generateToken(userId: number, roles: string[] = []) {
    // 生成 accessToken
    const accessToken = await this.generateAccessToken(userId, roles);
    // 生成refreshToken
    const refreshToken = await this.generateRefreshToken(accessToken, dayjs());
    return {
      accessToken: accessToken.sign,
      refreshToken: refreshToken.sign,
    };
  }

  /**
   * @description 生成 accessToken
   * @param userId
   * @param roles
   * @returns { accessToken, refreshToken }
   */
  async generateAccessToken(userId: number, roles: string[] = []) {
    const payload: IUser = {
      id: userId,
      roles,
    };

    // 生成 access token 时，不需要重复传递 secret，因为系统在 JwtModule 配置时，已经为签名设置了默认的 secret
    const jwtSign = await this.jwtService.signAsync(payload);

    // 生成accessToken
    const accessToken = new AccessTokenEntity();
    accessToken.sign = jwtSign;
    accessToken.userId = userId;
    accessToken.expiredAt = dayjs()
      .add(this.securityConfig.jwtExprire, 'second')
      .toDate();

    await accessToken.save();

    return accessToken;
  }

  /**
   * 生成新的RefreshToken并存入数据库
   * @param accessToken
   * @param now
   */
  async generateRefreshToken(accessToken: AccessTokenEntity, now: dayjs.Dayjs) {
    const payload = {};

    const refreshTokenSign = await this.jwtService.signAsync(payload, {
      secret: this.securityConfig.refreshTokenSecret,
    });

    const refreshToken = new RefreshTokenEntity();
    refreshToken.sign = refreshTokenSign;
    refreshToken.expiredAt = now
      .add(this.securityConfig.refreshTokenExpire, 'second')
      .toDate();

    await refreshToken.save();

    refreshToken.accessToken = accessToken.sign;

    return refreshToken;
  }

  // /**
  //  * 检查accessToken是否存在，并且是否处于有效期内
  //  * @param value
  //  */
  // async checkAccessToken(value: string) {
  //   let isValid = false;
  //   try {
  //     await this.verifyAccessToken(value);
  //     const res = await AccessTokenEntity.findOne({
  //       where: { value },
  //       relations: ['user', 'refreshToken'],
  //       cache: true,
  //     });
  //     isValid = Boolean(res);
  //   } catch (error) {}

  //   return isValid;
  // }

  // /**
  //  * 移除AccessToken且自动移除关联的RefreshToken
  //  * @param value
  //  */
  // async removeAccessToken(value: string) {
  //   const accessToken = await AccessTokenEntity.findOne({
  //     where: { value },
  //   });
  //   if (accessToken) {
  //     this.redis.del(genOnlineUserKey(accessToken.id));
  //     await accessToken.remove();
  //   }
  // }

  // /**
  //  * 移除RefreshToken
  //  * @param value
  //  */
  // async removeRefreshToken(value: string) {
  //   const refreshToken = await RefreshTokenEntity.findOne({
  //     where: { value },
  //     relations: ['accessToken'],
  //   });
  //   if (refreshToken) {
  //     if (refreshToken.accessToken)
  //       this.redis.del(genOnlineUserKey(refreshToken.accessToken.id));
  //     await refreshToken.accessToken.remove();
  //     await refreshToken.remove();
  //   }
  // }

  // /**
  //  * 验证Token是否正确,如果正确则返回所属用户对象
  //  * @param token
  //  */
  // async verifyAccessToken(token: string): Promise<IAuthUser> {
  //   return this.jwtService.verifyAsync(token);
  // }
}
