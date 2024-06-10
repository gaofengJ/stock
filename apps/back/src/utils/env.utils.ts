export const isDev = process.env.NODE_ENV === 'development';

/**
 * @description 基础类型
 */
export type BaseType = boolean | number | string | undefined | null;

/**
 * @description 格式化环境变量
 * @param key 配置键名
 * @param defaultValue 配置值
 * @param callback 回调函数，用于转换配置值的类型
 * @returns 格式化后的配置值
 */
// <T extends BaseType = string> 是 TypeScript 的泛型参数声明，<T> 表示这个函数接受一个泛型类型 T，并且这个类型必须是 BaseType 类型或者它的子类型
export const formatEnvConfig = <T extends BaseType = string>(
  key: string,
  defaultValue: T,
  callback?: (value: string) => T,
): T => {
  const configValue = process.env[key];
  if (!configValue) return defaultValue;
  if (callback) {
    return callback(configValue);
  }
  return configValue as T;
};

/**
 * @description 获取环境配置值
 * @param key 配置键名
 * @param defaultValue 配置值
 * @returns 格式化后的配置值
 */
export const getEnvConfig = (key: string, defaultValue: BaseType) => {
  return formatEnvConfig(key, defaultValue);
};

/**
 * @description 获取 string 类型的环境配置值
 * @param key 配置键名
 * @param defaultValue 配置值
 * @returns 格式化后的配置值
 */
export const getEnvConfigString = (key: string, defaultValue: string = '') => {
  return formatEnvConfig<string>(key, defaultValue);
};

/**
 * @description 获取 number 类型的环境配置值
 * @param key 配置键名
 * @param defaultValue 配置值
 * @returns 格式化后的配置值
 */
export const getEnvConfigNumber = (key: string, defaultValue: number = 0) => {
  return formatEnvConfig<number>(key, defaultValue, (value) => {
    return +value;
  });
};

/**
 * @description 获取 boolean 类型的环境配置值
 * @param key 配置键名
 * @param defaultValue 配置值
 * @returns 格式化后的配置值
 */
export const getEnvConfigBoolean = (
  key: string,
  defaultValue: boolean = false,
) => {
  return formatEnvConfig<boolean>(key, defaultValue, (value) => {
    return !!value;
  });
};
