import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { ACCESS, AccessRule } from '../auth/permissions';
import { DataLockService } from './data-lock.service';

@Injectable()
export class DataLockInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private locks: DataLockService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (rule?.any?.includes('data:write'))
      return from(this.locks.run(() => lastValueFrom(next.handle())));
    return next.handle();
  }
}
