import {
  Axios, AxiosError, InternalAxiosRequestConfig, isCancel,
} from 'axios';
import qs from 'qs';
import { parseJSON } from '@/utils';
import { IResData } from './types';
import { BaseAxios } from './request';
import { EBizError, RESPONSE_SUCCESS_CODE } from './config';

/**
 * 注册请求拦截器
 */
const registerRequestInterceptor = (ctx: BaseAxios, axios: Axios) => {
  axios.interceptors.request.use(
    (config) => {
      // 如果请求方法是 GET，设置参数序列化配置
      if (config.method === 'get') {
        config.paramsSerializer = {
          // 决定数组在序列化时是否包含索引，包含索引，适用于需要精确处理数组顺序的场
          serialize: (params) => qs.stringify(params, { indices: false, skipNulls: true }),
        };
      }
      // 处理并发请求，如果请求标记为 race，则使用 AbortController 来中止重复请求
      if (config.race) {
        const urlKey = ctx.getUrlKey(config.method, config.url, config.raceKey);
        if (ctx.requestMap.has(urlKey)) {
          ctx.requestMap.get(urlKey)?.abort();
        }
        const controller = new AbortController();
        // signal 属性是 AbortController 对象的一个属性，用于与支持取消功能的 API 一起使用。
        // 在需要取消请求时，通过将 signal 传递给请求配置，可以随时调用 AbortController 的 abort 方法取消请求
        config.signal = controller.signal;
        ctx.requestMap.set(urlKey, controller);
      }
      return config;
    },
    (error: AxiosError) => Promise.reject(error),
  );
};

/**
 * 注册响应拦截器
 */
const registerResponseInterceptor = (ctx: BaseAxios, axios: Axios) => {
  axios.interceptors.response.use(
    async (response) => {
      const { data, config } = response;
      const urlKey = ctx.getUrlKey(config.method, config.url, config.raceKey);

      // 处理并发请求，移除已完成的请求
      if (
        config.race
        && ctx.requestMap.get(urlKey)?.signal === config.signal
      ) {
        ctx.requestMap.delete(urlKey);
      }

      // 处理 Blob 类型响应
      if (data instanceof Blob) {
        if (response.config.responseType === 'blob' && data.type === 'application/json') {
          const { code, message } = await parseJSON<IResData>(data);

          // 处理未登录错误
          if (code === EBizError.UN_LOGIN) {
            ctx.handleUnLogin(message);
            // eslint-disable-next-line prefer-promise-reject-errors
            return Promise.reject({ code, config });
          }

          // 处理业务错误
          if (ctx.isBizError(code)) {
            ctx.showBizError(message, config);
            return Promise.reject(code);
          }

          // 处理其他非成功响应代码
          if (code !== RESPONSE_SUCCESS_CODE) {
            ctx.showBizError(message, config);
            return Promise.reject(code);
          }
        }
        return response;
      }

      const { code, message } = data;

      // 处理未登录错误
      if (code === EBizError.UN_LOGIN) {
        ctx.handleUnLogin(message);
        // eslint-disable-next-line prefer-promise-reject-errors
        return Promise.reject({ code, config });
      }

      // 处理业务错误
      if (ctx.isBizError(code)) {
        ctx.showBizError(message, config);
        return Promise.reject(code);
      }

      // 处理其他非成功响应代码
      if (code !== RESPONSE_SUCCESS_CODE) {
        ctx.showBizError(message, config);
        return Promise.reject(code);
      }
      return response;
    },
    async (error: AxiosError) => {
      const { message, config } = error;
      const isTimeout = error.code === 'ECONNABORTED';
      const responseMessage = (error.response?.data as { message?: string })
        ?.message;
      const configuredMessage = error.response?.status
        ? ctx.errorMessageMap?.[error.response.status]
        : undefined;
      if (config?.race) {
        const urlKey = ctx.getUrlKey(config.method, config.url, config.raceKey);
        if (ctx.requestMap.get(urlKey)?.signal === config.signal) {
          ctx.requestMap.delete(urlKey);
        }
      }
      if (isCancel(error)) return Promise.reject(error);

      const mappedMessage = typeof configuredMessage === 'function'
        ? configuredMessage()
        : configuredMessage;
      const errorMessage = isTimeout
        ? '请求超时，请稍后重试'
        : responseMessage || mappedMessage || message;
      ctx.showBizError(
        errorMessage,
        config as InternalAxiosRequestConfig,
      );
      return Promise.reject(error);
    },
  );
};

// 默认导出函数，用于注册请求和响应拦截器
export default (ctx: BaseAxios, axios: Axios) => {
  registerRequestInterceptor(ctx, axios);
  registerResponseInterceptor(ctx, axios);
};
