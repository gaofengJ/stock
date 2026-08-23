import { genRandomString } from '@/utils';

export const RESPONSE_SUCCESS_CODE = 0;

/**
 * Http 错误码
 */
export enum EHttpError {
  /**
   * 未登录
   */
  UN_LOGIN = 401,
  /**
   * 接口404
   */
  UN_AVAILABLE = 404,
  /**
   * 系统异常
   */
  SERVICE_ERROR = 500,
}

/**
 * 业务 错误码
 */
export enum EBizError {
  /**
   * 未登录
   */
  UN_LOGIN = -101,
  /**
   * 无权限
   */
  NO_PERMISSION = -403,
  /**
   * 服务器异常
   */
  SERVICE_ERROR = -500
}

export const errorConfig = {
  defaultErrorMessage: '请求失败',
  errorMessageMap: {
    [EHttpError.UN_LOGIN]: '登录失败，请重新登录',
    [EHttpError.UN_AVAILABLE]: '接口未找到',
    [EHttpError.SERVICE_ERROR]: '请求失败',
  },
  bizErrorCodeArr: [EBizError.NO_PERMISSION, EBizError.SERVICE_ERROR],
};

export const defaultConfig = {
  baseURL: '/api',
  headers: {
    'X-CSRF': genRandomString(),
  },
  timeout: 30000, // 查询接口最长等待 30 秒，避免异常请求无限挂起
  withCredentials: true, // 在跨域请求中携带凭据，这在需要进行身份验证的请求中非常重要
};
