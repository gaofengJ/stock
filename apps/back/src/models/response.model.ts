import { ApiProperty } from '@nestjs/swagger';
import { RESPONSE_SUCCESS_CODE, RESPONSE_SUCCESS_MSG } from '@/constants';

/**
 * 定义一个泛型类 Res，泛型 T 默认为 any，用于封装相应操作
 */
export class ResModel<T = any> {
  // 使用 ResModel 装饰器描述 data 属性，类型为 'object'
  // data 属性是一个可选的泛型类型，用于存储响应数据
  @ApiProperty({ type: 'object' })
  data?: T;

  // 使用 ApiProperty 装饰器描述 code 属性，类型为 'number'
  // 默认值为 RESPONSE_SUCCESS_CODE
  @ApiProperty({ type: 'number', default: RESPONSE_SUCCESS_CODE })
  code: number;

  @ApiProperty({ type: 'string', default: RESPONSE_SUCCESS_MSG })
  message: string;

  constructor(code: number, data: T, message = RESPONSE_SUCCESS_MSG) {
    this.code = code;
    this.data = data;
    this.message = message;
  }

  static success<T>(data?: T, message?: string) {
    return new ResModel(RESPONSE_SUCCESS_CODE, data, message);
  }

  static error(code: number, message: string) {
    return new ResModel(code, {}, message);
  }
}
