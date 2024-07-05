import { AxiosError, AxiosRequestConfig, CreateAxiosDefaults } from 'axios';

export interface IRes {
  code: number;
  message: string;
}

export interface IResData<T = any> extends IRes {
  data: T;
}

export interface RequestConfig<D = any> extends AxiosRequestConfig<D> {
  /**
   * 是否开启竞态，开启后，连续触发同一个 url 的请求，前一次会被 abort
   */
  race?: boolean;
  /**
   * 是否自动提示错误信息
   */
  autoShowError?: boolean;
}

/**
 * 扩展 axios
 */
declare module 'axios' {
  interface CreateAxiosDefaults<D = any> extends Omit<AxiosRequestConfig<D>, 'header'> {
    headers?: RawAxiosRequestHeaders | AxiosHeaders | Partial<HeadersDefaults>
    /**
     * 异常信息 map
     */
    errorMessageMap?: Record<number, string | (() => string)>;
    /**
     * 默认异常信息
     */
    defaultErrorMessage?: string;
    /**
     * 业务错误码 arr
     */
    bizErrorCodeArr?: number[];
    /**
     * 错误提示方法
     */
    errorMessage?: (message: string, error: any) => void;
  }

  interface InternalAxiosRequestConfig<D = any> extends RequestConfig<D> {
    headers: AxiosRequestHeaders;
  }
}

export type { AxiosRequestConfig, AxiosError, CreateAxiosDefaults };
