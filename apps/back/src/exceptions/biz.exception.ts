import { HttpException, HttpStatus } from '@nestjs/common';
import { CustomErrorEnum, EType } from '@/types/common.enum';
import { RESPONSE_SUCCESS_CODE } from '@/constants';
import { getType } from '@/utils';

/**
 * 自定义异常类 BizException
 */
export class BizException extends HttpException {
  private errorCode: number; // 错误码

  constructor(error: CustomErrorEnum | number) {
    if (getType(error) === EType.number) {
      // 如果不是 `CustomErrorEnum` 类型，则构造 HTTP 异常，使用成功响应码
      super(
        HttpException.createBody({
          code: RESPONSE_SUCCESS_CODE,
          message: error,
        }),
        HttpStatus.OK,
      );
      this.errorCode = RESPONSE_SUCCESS_CODE;
      return;
    }

    // 如果是 `CustomErrorEnum` 类型，则将错误字符串分割为错误码和错误消息
    const [code, message] = (error as CustomErrorEnum).split(':');
    super(
      HttpException.createBody({
        code,
        message,
      }),
      HttpStatus.OK,
    );

    this.errorCode = +code;
  }

  /**
   * @description 获取错误码
   */
  getErrorCode(): number {
    return this.errorCode;
  }
}
