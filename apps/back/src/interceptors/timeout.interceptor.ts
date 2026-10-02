import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, TimeoutError, throwError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { NO_TIMEOUT_INTERCEPTOR_KEY } from '@/decorators/no-timeout.decorator';
import { QUERY_TIMEOUT_MS } from '@/decorators/query-timeout.decorator';

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const time = this.reflector.get<number>(QUERY_TIMEOUT_MS, handler) ?? 15000;
    const noTimeoutInterceptor = this.reflector.get<boolean>(
      NO_TIMEOUT_INTERCEPTOR_KEY,
      handler,
    );

    if (noTimeoutInterceptor) {
      return next.handle(); // 如果标记为不使用超时拦截器，则直接返回
    }

    return next.handle().pipe(
      timeout(time),
      catchError((err) => {
        if (err instanceof TimeoutError)
          return throwError(() => new RequestTimeoutException('请求超时'));

        return throwError(() => err);
      }),
    );
  }
}
