import { SetMetadata, applyDecorators } from '@nestjs/common';
import { isPlainObject } from 'lodash';

import { PERMISSION_KEY } from '@/constants';

/**
 * TupleToObject 类型将元组形式的权限数组转换为对象形式，
 * 键名为权限的大写形式，
 * 值为权限的带前缀的字符串格式
 */
type TupleToObject<T extends string, P extends ReadonlyArray<string>> = {
  [K in Uppercase<P[number]>]: `${T}:${Lowercase<K>}`;
};
/**
 * AddPrefixToObjectValue 类型将对象中的值统一添加前缀，键名不变
 */
type AddPrefixToObjectValue<
  T extends string,
  P extends Record<string, string>,
> = {
  [K in keyof P]: K extends string ? `${T}:${P[K]}` : never;
};

/**
 * @description 资源操作需要特定的权限，
 * 返回 SetMetadata 装饰器的应用结果，
 * 设置 PERMISSION_KEY 元数据为指定的权限
 * @param permission
 * @returns
 */
export function Perm(permission: string | string[]) {
  return applyDecorators(SetMetadata(PERMISSION_KEY, permission));
}

/** (此举非必需)保存通过 definePermission 定义的所有权限，可用于前端开发人员开发阶段的 ts 类型提示，避免前端权限定义与后端定义不匹配 */
let permissions: string[] = [];

/**
 * 第一个重载：对象形式定义权限
 */
export function definePermission<
  T extends string,
  U extends Record<string, string>,
>(modulePrefix: T, actionMap: U): AddPrefixToObjectValue<T, U>;

/**
 * 第二个重载：字符串数组形式定义权限
 */
export function definePermission<
  T extends string,
  U extends ReadonlyArray<string>,
>(modulePrefix: T, actions: U): TupleToObject<T, U>;

/**
 * @description definePermission的实现
 */
export function definePermission(modulePrefix: string, actions: any) {
  // 检查参数类型，如果是对象形式则执行以下逻辑
  if (isPlainObject(actions)) {
    Object.entries(actions).forEach(([key, action]) => {
      // 遍历对象的每一项，并为每个权限添加前缀
      // eslint-disable-next-line no-param-reassign
      actions[key] = `${modulePrefix}:${action}`;
    });

    // 更新权限数组，将新权限添加进去
    permissions = [
      ...new Set([...permissions, ...Object.values<string>(actions)]),
    ];
    return actions; // 返回添加了前缀的权限对象
  }

  // 检查参数类型，如果是字符串数组形式则执行以下逻辑
  if (Array.isArray(actions)) {
    const permissionFormats = actions.map(
      // 为每个权限添加前缀，并更新权限数组
      (action) => `${modulePrefix}:${action}`,
    );
    permissions = [...new Set([...permissions, ...permissionFormats])];

    // 返回添加了前缀的权限对象
    return actions.reduce((prev, action) => {
      // eslint-disable-next-line no-param-reassign
      prev[action.toUpperCase()] = `${modulePrefix}:${action}`;
      return prev;
    }, {});
  }
  return null;
}

/**
 * @description 获取所有通过 definePermission 定义的权限
 */
export const getDefinePermissions = () => permissions;
