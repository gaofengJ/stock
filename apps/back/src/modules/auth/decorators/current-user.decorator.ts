import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

type Payload = keyof IUser;

/**
 * @description 获取当前登录用户信息, 并挂载到request上
 */
export const CurrentUser = createParamDecorator(
  (field: Payload, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();

    const user = request.user as IUser;

    return field ? user?.[field] : user;
  },
);
