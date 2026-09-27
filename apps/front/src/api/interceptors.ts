import { csrfToken, authFailure } from '@/auth/client';
import {
  Axios, AxiosError, isCancel,
} from 'axios';
import qs from 'qs';
import { BaseAxios } from './request';
import { EBizError, RESPONSE_SUCCESS_CODE } from './config';
import { errorMessage, userError } from './errors';

/**
 * 注册请求拦截器
 */
const registerRequestInterceptor = (ctx: BaseAxios, axios: Axios) => {
  axios.interceptors.request.use(
    async (config) => {
      if (!['get', 'head', 'options'].includes(config.method || 'get')) config.headers['X-CSRF-Token'] = await csrfToken();
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

      try {
        let body = data;
        if (data instanceof Blob) {
          if (!/json|html/i.test(data.type)) return response;
          body = JSON.parse(await data.text());
        }
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.code !== 'number' || !('data' in body)) {
          throw new Error('服务返回的数据格式异常，请稍后重试');
        }
        if (body.code !== RESPONSE_SUCCESS_CODE) {
          if (body.code === EBizError.UN_LOGIN) authFailure(401);
          throw Object.assign(userError(body.message, body.code === EBizError.UN_LOGIN ? 401 : undefined), { code: body.code });
        }
        return response;
      } catch (error) {
        const localized = Object.assign(userError(error), { config, code: (error as { code?: number })?.code });
        ctx.showBizError(localized.message, config);
        throw localized;
      }
    },
    async (error: AxiosError) => {
      const { config } = error;
      authFailure(error.response?.status || 0);
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
      // 不仅提示框使用中文，调用页面接收到的异常也必须使用中文。
      const localized = error as AxiosError;
      localized.message = errorMessage(error, errorMessage(mappedMessage));
      ctx.showBizError(localized.message, config);
      return Promise.reject(localized);
    },
  );
};

// 默认导出函数，用于注册请求和响应拦截器
export default (ctx: BaseAxios, axios: Axios) => {
  registerRequestInterceptor(ctx, axios);
  registerResponseInterceptor(ctx, axios);
};
