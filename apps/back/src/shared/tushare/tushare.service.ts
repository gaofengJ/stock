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

  /** 分页读取并拒绝重复页，防止接口静默截断后误发布完整数据。 */
  async queryData(
    api: string,
    params: Record<string, unknown>,
    fields?: string,
    pageSize = 6000,
    timeout = 60000,
  ): Promise<IBaseRes<ITushareData>> {
    let output: ITushareData | undefined;
    const signatures = new Set<string>();
    for (let offset = 0; offset < 100000; offset += pageSize) {
      // eslint-disable-next-line no-await-in-loop
      const response = await this.request({
        timeout,
        data: {
          api_name: api,
          params: { ...params, limit: pageSize, offset },
          ...(fields && { fields }),
        },
      });
      const data = response.data as ITushareData;
      if (!Array.isArray(data?.fields) || !Array.isArray(data.items))
        throw new Error(`${api} 返回结构异常`);
      if (!output) output = { fields: data.fields, items: [] };
      if (JSON.stringify(output.fields) !== JSON.stringify(data.fields))
        throw new Error(`${api} 分页字段不一致`);
      if (data.items.length) {
        const signature = JSON.stringify(data.items);
        if (signatures.has(signature))
          throw new Error(`${api} 分页重复，拒绝不完整快照`);
        signatures.add(signature);
      }
      output.items.push(...data.items);
      if (data.items.length < pageSize)
        return { code: 0, message: 'success', data: output };
    }
    throw new Error(`${api} 超出单次同步安全上限`);
  }

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
      baseURL: 'https://api.tushare.pro',
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
    return this.queryData('daily', { trade_date: date });
  }

  /**
   * @description 涨停价、跌停价
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getDailyLimit(date: string): Promise<IBaseRes<ITushareData>> {
    return this.queryData('stk_limit', { trade_date: date }, undefined, 5800);
  }

  /**
   * @description 每日指标-获取全部股票每日重要的基本面指标
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getDailyBasic(date: string): Promise<IBaseRes<ITushareData>> {
    return this.queryData('daily_basic', { trade_date: date });
  }

  /**
   * @description 涨跌停统计
   * @param date 日期
   * @returns Promise<IBaseRes>
   */
  getLimitList(date: string): Promise<IBaseRes<ITushareData>> {
    return this.queryData(
      'limit_list_d',
      { trade_date: date },
      undefined,
      2500,
    );
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
