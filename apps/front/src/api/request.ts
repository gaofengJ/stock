/* eslint-disable class-methods-use-this */
import { message } from 'antd';
import axios, {
  AxiosInstance, CreateAxiosDefaults,
} from 'axios';

import { defaultConfig, errorConfig } from './config';
import interceptors from './interceptors';
import { IResData, RequestConfig } from './types';

/**
 * BaseAxios 类，用于创建和管理 Axios 实例
 */
export class BaseAxios {
  /**
   * axios 实例
   */
  private service: AxiosInstance;

  /**
   * 存储请求的 map，用于取消重复请求
   */
  requestMap: Map<string, AbortController> = new Map();

  /**
   * 默认错误信息配置
   */
  private defaultErrorMessage: Exclude<CreateAxiosDefaults['defaultErrorMessage'], undefined> = errorConfig.defaultErrorMessage;

  /**
   * 错误信息配置 map
   */
  errorMessageMap: CreateAxiosDefaults['errorMessageMap'] = errorConfig.errorMessageMap;

  /**
   * 业务错误码集合
   */
  bizErrorCodeArr: Exclude<CreateAxiosDefaults['bizErrorCodeArr'], undefined> = errorConfig.bizErrorCodeArr;

  /**
   * 消息弹出回调
   */
  errorMessage?: ((msg: string) => void);

  constructor(config: CreateAxiosDefaults) {
    this.service = axios.create(config);
    // 初始化默认错误信息
    this.defaultErrorMessage = config.defaultErrorMessage as string;
    // 初始化错误信息映射表
    this.errorMessageMap = config.errorMessageMap;
    // 初始化业务错误码集合
    this.bizErrorCodeArr = config.bizErrorCodeArr || [];
    // 初始化消息弹出回调
    if (config.errorMessage) {
      this.errorMessage = config.errorMessage;
    }

    // 注册拦截器
    interceptors(this, this.service);
  }

  /**
   * 封装 get 请求
   * @param url - 请求 URL
   * @param config - 请求配置
   * @returns 请求的响应数据
   */
  async get<T>(url: string, config?: RequestConfig):
    Promise<IResData<T>> {
    const res = await this.service.get<IResData<T>>(url, config);
    return res.data;
  }

  /**
   * 封装 post 请求
   * @param url - 请求 URL
   * @param data - 请求数据
   * @param config - 请求配置
   * @returns 请求的响应数据
   */
  async post<T>(url: string, data?: any, config?: RequestConfig):
    Promise<IResData<T>> {
    const res = await this.service.post<IResData<T>>(url, data, config);
    return res.data;
  }

  /**
   * 封装 put 请求
   * @param url - 请求 URL
   * @param data - 请求数据
   * @param config - 请求配置
   * @returns 请求的响应数据
   */
  async put<T>(url: string, data?: any, config?: RequestConfig):
    Promise<IResData<T>> {
    const res = await this.service.put<IResData<T>>(url, data, config);
    return res.data;
  }

  /**
   * 封装 delete 请求
   * @param url - 请求 URL
   * @param config - 请求配置
   * @returns 请求的响应数据
   */
  async delete<T>(url: string, config?: RequestConfig):
    Promise<IResData<T>> {
    const res = await this.service.delete<IResData<T>>(url, config);
    return res.data;
  }

  /**
   * 处理错误
   * @param error - 错误对象
   * @param config - 请求配置
   */
  private handleError(error: any, config?: RequestConfig) {
    // 错误处理逻辑
    if (error.response) {
      const { status, data } = error.response;
      if (this.isBizError(status)) {
        this.showBizError(data.message, config);
      } else {
        this.showErrorMessage(data.message || this.defaultErrorMessage);
      }
    } else {
      this.showErrorMessage(error.message || this.defaultErrorMessage);
    }
  }

  /**
   * 获取请求的唯一标识符
   * @param method - 请求方法
   * @param url - 请求 URL
   * @returns 请求的唯一标识符
   */
  getUrlKey(method?: string, url?: string) {
    return `${method}-${url}`;
  }

  /**
   * 显示错误消息
   * @param msg - 错误信息
   */
  showErrorMessage(msg: string) {
    if (this.errorMessage) {
      this.errorMessage(msg);
      return;
    }
    message.error(msg);
  }

  /**
   * 判断是否为业务错误
   * @param code - 错误码
   * @returns 是否为业务错误
   */
  isBizError(code: number) {
    return this.bizErrorCodeArr.includes(code);
  }

  /**
   * 显示业务错误信息
   * @param msg - 错误信息
   * @param config - 请求配置
   */
  showBizError(msg: string, config?: RequestConfig) {
    if (!config?.autoShowError) return;
    this.showErrorMessage(msg || this.defaultErrorMessage as string);
  }

  /**
   * 处理未登录错误
   * @param msg - 错误信息
   * @param config - 请求配置
   */
  handleUnLogin(msg: string) {
    this.showErrorMessage(msg);
  }
}

/**
 * 导出默认的 BaseAxios 实例
 */
export default new BaseAxios({
  ...defaultConfig,
});
