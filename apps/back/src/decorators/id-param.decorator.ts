import {
  HttpStatus,
  NotAcceptableException,
  Param,
  ParseIntPipe,
} from '@nestjs/common';

/**
 * @description 定义自定义装饰器函数 IdParam
 * @returns
 */
export function IdParam() {
  return Param(
    'id',
    new ParseIntPipe({
      errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE,
      exceptionFactory: () => {
        throw new NotAcceptableException('id 格式不正确');
      },
    }),
  );
}
