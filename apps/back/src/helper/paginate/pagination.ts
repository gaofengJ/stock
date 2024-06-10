import { ObjectLiteral } from 'typeorm';

import { IPaginationMeta } from './interface';

/**
 * @description 定义一个泛型类 Pagination
 */
export class Pagination<
  PaginationObject,
  T extends ObjectLiteral = IPaginationMeta,
> {
  constructor(
    // items 参数是一个 PaginationObject 类型的数组，表示分页的内容
    public readonly items: PaginationObject[],

    // meta 参数是一个 T 类型的对象，表示分页的元数据
    public readonly meta: T,
  ) {}
}
