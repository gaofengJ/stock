import {
  ArgumentsHost, // 参数宿主，用于获取当前请求的上下文
  Catch, // 捕获装饰器，用于标记异常过滤器
  ExceptionFilter, // 异常过滤器接口
  HttpException, // HTTP 异常类
  HttpStatus, // HTTP 状态码枚举
  Logger, // 日志记录器
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { QueryFailedError } from 'typeorm';

import { BizException } from '@/exceptions/biz.exception';
import { ECustomError } from '@/types/common.enum';
import { isDev } from '@/utils';

/**
 * 自定义错误
 */
interface CustomError {
  readonly status: number;
  readonly statusCode?: number;
  readonly message?: string;
}

/**
 * 使用 @Catch 装饰器捕获所有异常
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name); // 初始化日志记录器

  constructor() {
    this.registerCatchAllExceptionsHook(); // 注册捕获所有异常的钩子
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp(); // 获取 HTTP 请求上下文
    const request = ctx.getRequest<FastifyRequest>(); // 获取 Fastify 请求对象
    const response = ctx.getResponse<FastifyReply>(); // 获取 Fastify 响应对象

    const url = request.raw.url!; // ! 是 TypeScript 中的非空断言操作符

    const status = this.getStatus(exception); // 获取异常的状态码
    let message = this.getErrorMessage(exception); // 获取异常的错误信息

    if (
      status === HttpStatus.INTERNAL_SERVER_ERROR &&
      !(exception instanceof BizException)
    ) {
      // 如果是内部服务器错误且不是自定义的服务器异常
      Logger.error(exception, undefined, 'Catch');
      // 生产环境下隐藏错误信息
      if (!isDev) message = ECustomError.SERVER_ERROR?.split(':')[1]; // 在生产环境下隐藏错误信息
    } else {
      this.logger.warn(
        `错误信息：(${status}) ${message} Path: ${decodeURI(url)}`,
      );
    }

    const apiErrorCode =
      exception instanceof BizException ? exception.getErrorCode() : status; // 确定 API 错误代码

    // 返回基础响应结果
    const resBody: IBaseRes = {
      code: apiErrorCode,
      message,
      data: null,
    };

    response.status(status).send(resBody); // 发送响应
  }

  /**
   * 获取异常的状态码
   */
  getStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    if (exception instanceof QueryFailedError) {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }

    return (
      (exception as CustomError)?.status ??
      (exception as CustomError)?.statusCode ??
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  /**
   * 获取异常的错误信息
   */
  getErrorMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      return exception.message;
    }
    if (exception instanceof QueryFailedError) {
      return exception.message;
    }

    return (
      (exception as any)?.response?.message ??
      (exception as CustomError)?.message ??
      `${exception}`
    );
  }

  /**
   * 注册捕获所有未处理的异常和拒绝的钩子
   */
  registerCatchAllExceptionsHook() {
    process.on('unhandledRejection', (reason) => {
      console.error('unhandledRejection: ', reason);
    });

    process.on('uncaughtException', (err) => {
      console.error('uncaughtException: ', err);
    });
  }
}
