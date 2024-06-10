import { SetMetadata, applyDecorators } from '@nestjs/common';

import { ObjectLiteral, ObjectType, Repository } from 'typeorm';

import { RESOURCE_KEY } from '@/constants';

/**
 * @description 定义一个 Condition 类型，表示一个函数类型
 * @param Repository 实体的仓库
 * @param items 一个包含项目 ID 的数组
 * @param user 一个表示当前用户的对象
 */
export type Condition<E extends ObjectLiteral = any> = (
  Repository: Repository<E>,
  items: number[],
  user: IAuthUser,
) => Promise<boolean>;

export interface ResourceObject {
  entity: ObjectType<any>; // 实体类型
  condition: Condition; // 条件函数
}

/**
 * Resource装饰器函数
 * @param entity 实体类型
 * @param condition 条件函数
 * @returns
 */
export function Resource<E extends ObjectLiteral = any>(
  entity: ObjectType<E>,
  condition?: Condition<E>,
) {
  return applyDecorators(SetMetadata(RESOURCE_KEY, { entity, condition }));
}
