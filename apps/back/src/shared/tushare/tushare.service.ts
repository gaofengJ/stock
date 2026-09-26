import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { AxiosRequestConfig } from 'axios';
import { getEnvConfigString } from '@/utils';
import { EGlobalTushareConfig } from '@/types/common.enum';

export type ITushareData = {
  fields: string[];
  items: any[];
};

class TushareRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
@Injectable()
export class TushareService {
  constructor(private readonly httpService: HttpService) {}

  private async request(config: AxiosRequestConfig) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await this.requestOnce(config);
      } catch (error) {
        const status = error?.response?.status;
        const retryable =
          error instanceof TushareRequestError
            ? error.retryable
            : status === 429 ||
              status >= 500 ||
              ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(
                error?.code,
              );
        if (!retryable || attempt === 2) {
          // 不把 Axios config 中的 token 写入日志或错误响应。
          throw new Error(
            `Tushare ${config.data?.api_name} 请求失败: ${
              error instanceof TushareRequestError
                ? error.message
                : status || error?.code || '响应异常'
            }`,
          );
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => {
          setTimeout(resolve, 1000 * 2 ** attempt);
        });
      }
    }
    throw new Error('Tushare 重试次数耗尽');
  }

  private async requestOnce(config: AxiosRequestConfig) {
    const response = await this.httpService.axiosRef.request({
      method: 'post',
      baseURL: 'http://api.waditu.com',
      headers: {
        'Content-Type': 'application/json',
      },
      transformRequest: [
        (body) =>
          JSON.stringify({
            ...body,
            token: getEnvConfigString(EGlobalTushareConfig.TUSHARE_CONF_TOKEN),
          }),
      ],
      transformResponse: [(res) => JSON.parse(res)],
      timeout: 1000 * 60, // 防止请求超时导致后续导入报错
      ...config,
    });
    const { data } = response;

    if (data?.code !== 0) {
      const message = String(data?.msg || '响应缺少成功状态');
      throw new TushareRequestError(
        message,
        /每分钟|每秒|频率|频次|稍后|繁忙/.test(message) &&
          !/每天|每日|权限|积分/.test(message),
      );
    }

    return {
      code: data.code,
      message: !data.code ? 'success' : data.msg,
      data: data.data,
    };
  }

  /**
   * @description 股票基本信息
   * @param exchange 交易所
   * @returns Promise<IBaseRes>
   */
  getStockBasic(): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'stock_basic',
        fields: [
          'ts_code',
          'symbol',
          'name',
          'area',
          'industry',
          'fullname',
          'enname',
          'cnspell',
          'market',
          'exchange',
          'curr_type',
          'list_status',
          'list_date',
          'delist_date',
          'is_hs',
        ],
      },
    });
  }

  /**
   * @description 交易日期
   * @param year 年份
   * @returns Promise<IBaseRes>
   */
  getTradeCal(year: string): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'trade_cal',
        params: {
          exchange: 'SSE',
          start_date: `20200101`, // 开始时间默认2020-01-01
          end_date: `${year}1231`,
        },
      },
    });
  }

  /**
   * @description 每日统计-日线数据
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getDaily(date: string): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'daily',
        params: { trade_date: date },
      },
    });
  }

  /**
   * @description 涨停价、跌停价
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getDailyLimit(date: string): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'stk_limit',
        params: { trade_date: date },
      },
    });
  }

  /**
   * @description 每日指标-获取全部股票每日重要的基本面指标
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getDailyBasic(date: string): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'daily_basic',
        params: { trade_date: date },
      },
    });
  }

  /**
   * @description 涨跌停统计
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getLimitList(date: string): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'limit_list_d',
        params: { trade_date: date },
      },
    });
  }

  /**
   * @description 游资名录
   * @returns Promise<IBaseRes>
   */
  getActiveFunds(): Promise<IBaseRes<ITushareData>> {
    return this.request({
      data: {
        api_name: 'hm_list',
      },
    });
  }
}
