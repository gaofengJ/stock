/* eslint-disable no-restricted-syntax -- Map iteration prunes expired rate-limit records in bounded memory. */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import { ACCESS, AccessRule } from './permissions';
import { AuthRequest, AuthService, digest } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private attempts = new Map<string, { count: number; until: number }>();

  constructor(
    private reflector: Reflector,
    private auth: AuthService,
  ) {}

  private limit(key: string, max: number, period: number) {
    const now = Date.now();
    if (this.attempts.size > 10000)
      for (const [k, v] of this.attempts)
        if (v.until < now) this.attempts.delete(k);
    if (this.attempts.size > 20000 && !this.attempts.has(key))
      throw new HttpException('请求过于频繁', 429);
    let v = this.attempts.get(key);
    if (!v || v.until < now) {
      v = { count: 0, until: now + period };
      this.attempts.set(key, v);
    }
    v.count += 1;
    if (v.count > max) throw new HttpException('操作过于频繁，请稍后再试', 429);
  }

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AuthRequest>();
    const reply = ctx.switchToHttp().getResponse();
    reply.header('Cache-Control', 'no-store');
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) throw new ForbiddenException('接口未配置访问权限');
    if (
      process.env.NODE_ENV === 'production' &&
      req.method === 'DELETE' &&
      rule.any?.includes('data:write')
    )
      throw new ForbiddenException('生产环境禁止通过通用接口删除行情数据');
    const url = req.routeOptions?.url || req.url.split('?')[0];
    if (/\/auth\/(login|register|csrf)$/.test(url)) {
      const registration = url.endsWith('/register');
      this.limit(
        `${url}:ip:${req.ip}`,
        registration ? 10 : 60,
        registration ? 3600000 : 900000,
      );
      if (url.endsWith('/login')) {
        const name = String((req.body as any)?.username || '')
          .trim()
          .toLowerCase();
        this.limit(`login:user:${name}`, 20, 900000);
      }
    }
    const session = await this.auth.session(req);
    req.authSession = session;
    if (!rule.public && !session?.user_id)
      throw new UnauthorizedException('请先登录');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const { origin } = req.headers;
      const allowed = (
        process.env.AUTH_ALLOWED_ORIGINS ||
        'http://localhost:8081,http://127.0.0.1:8081'
      )
        .split(',')
        .map((s) => s.trim());
      if (origin && !allowed.includes(origin))
        throw new ForbiddenException('请求来源不受信任');
      const csrf = req.headers['x-csrf-token'];
      if (
        !session ||
        typeof csrf !== 'string' ||
        !/^[a-f0-9]{64}$/.test(csrf) ||
        !timingSafeEqual(
          Buffer.from(digest(csrf), 'hex'),
          Buffer.from(session.csrf_hash, 'hex'),
        )
      )
        throw new ForbiddenException('CSRF 验证失败，请刷新页面');
    }
    if (rule.public) return true;
    if (!session?.user_id) throw new UnauthorizedException('请先登录');
    req.authUser = await this.auth.current(session.user_id);
    if (req.authUser.mustChangePassword && !rule.allowPasswordChange)
      throw new ForbiddenException('请先修改初始密码');
    if (rule.login) return true;
    if (!rule.any?.some((p) => req.authUser!.permissions.includes(p)))
      throw new ForbiddenException('无权访问此功能');
    return true;
  }
}
