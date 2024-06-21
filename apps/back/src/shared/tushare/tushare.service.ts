import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { AxiosRequestConfig } from 'axios';
import { getEnvConfigString } from '@/utils';
import { EGlobalTushareConfig } from '@/types/common.enum';

@Injectable()
export class TushareService {
  constructor(private readonly httpService: HttpService) {}

  private async request(config: AxiosRequestConfig) {
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
      ...config,
    });
    const { data } = response;

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
  getStockBasic(exchange: string): Promise<IBaseRes> {
    return this.request({
      data: {
        api_name: 'stock_basic',
        params: { exchange },
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
  getTradeCal(year: string): Promise<IBaseRes> {
    return this.request({
      data: {
        api_name: 'trade_cal',
        params: {
          exchange: 'SSE',
          start_date: `${year}0101`,
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
  getDaily(date: string): Promise<IBaseRes> {
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
  getDailyLimit(date: string): Promise<IBaseRes> {
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
  getDailyBasic(date: string): Promise<IBaseRes> {
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
  getLimitList(date: string): Promise<IBaseRes> {
    return this.request({
      data: {
        api_name: 'limit_list_d',
        params: { trade_date: date },
      },
    });
  }
}
