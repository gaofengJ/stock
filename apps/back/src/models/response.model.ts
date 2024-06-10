import { HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

/**
 * 定义一个泛型类 Res，泛型 T 默认为 any，用于封装相应操作
 */
export class Res<T = any> {
  // 使用 Res 装饰器描述 data 属性，类型为 'object'
  // data 属性是一个可选的泛型类型，用于存储响应数据
  @ApiProperty({ type: 'object' })
  data?: T;

  // 使用 ApiProperty 装饰器描述 code 属性，类型为 'number'
  // 默认值为 HttpStatus.OK
  @ApiProperty({ type: 'number', default: HttpStatus.OK })
  code: number;

  @ApiProperty({ type: 'string', default: 'success' })
  message: string;

  constructor(code: number, data: T, message: string = 'success') {
    this.code = code;
    this.data = data;
    this.message = message;
  }

  static success<T>(data?: T, message?: string) {
    return new Res(HttpStatus.OK, data, message);
  }

  static error(code: number, message: string) {
    return new Res(code, {}, message);
  }
}
