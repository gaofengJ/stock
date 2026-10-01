import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Like, Not, Repository } from 'typeorm';

import * as dayjs from 'dayjs';
import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { Order } from '@/dto/pager.dto';
import { SentiUpDownCountEntity } from '@/modules/analysis/senti/senti.entity';

import { DailyEntity } from './daily.entity';
import { DailyDto, DailyQueryDto, DailyUpdateDto } from './daily.dto';
import {
  hasValidStrategySequence,
  hasUpperShadowAboveThreePercent,
  meetsCommonStrategyConditions,
} from './strategy-validation';

@Injectable()
export class DailyService {
  constructor(
    private readonly writes: SyncWriteService,
    @InjectRepository(DailyEntity)
    private DailyRepository: Repository<DailyEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    tradeDate,
    startDate,
    endDate,
    tsCode,
    name,
    fields = [], // 默认值为空数组
  }: DailyQueryDto): Promise<Pagination<DailyEntity>> {
    let queryBuilder =
      this.DailyRepository.createQueryBuilder('t_source_daily');

    // 如果 fields 数组不为空，则使用 select 语句
    if (fields.length > 0) {
      queryBuilder = queryBuilder.select(
        fields.map((i: string) => `t_source_daily.${i}`),
      );
    }

    queryBuilder = queryBuilder.where({
      ...(tradeDate && { tradeDate }),
      ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      ...(tradeDate && { tradeDate }),
      ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
      ...(name && { name: Like(`%${name}%`) }),
      amount: Not(0), // 排除成交量为 0 的股票，例如暂停交易的股票、各类ETF
    });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  /**
   * 获取指定日期的股票价格分布统计
   * @param tradeDate 交易日期
   * @returns 股票价格分布统计数组
   */
  async getDistributionStatistics(tradeDate: string): Promise<number[]> {
    const queryBuilder = this.DailyRepository.createQueryBuilder(
      't_source_daily',
    )
      .select([
        `SUM(CASE WHEN t_source_daily.pct_chg <= -9 THEN 1 ELSE 0 END) AS c0`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -9 AND t_source_daily.pct_chg <= -8 THEN 1 ELSE 0 END) AS c1`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -8 AND t_source_daily.pct_chg <= -7 THEN 1 ELSE 0 END) AS c2`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -7 AND t_source_daily.pct_chg <= -6 THEN 1 ELSE 0 END) AS c3`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -6 AND t_source_daily.pct_chg <= -5 THEN 1 ELSE 0 END) AS c4`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -5 AND t_source_daily.pct_chg <= -4 THEN 1 ELSE 0 END) AS c5`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -4 AND t_source_daily.pct_chg <= -3 THEN 1 ELSE 0 END) AS c6`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -3 AND t_source_daily.pct_chg <= -2 THEN 1 ELSE 0 END) AS c7`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -2 AND t_source_daily.pct_chg <= -1 THEN 1 ELSE 0 END) AS c8`,
        `SUM(CASE WHEN t_source_daily.pct_chg > -1 AND t_source_daily.pct_chg < 0 THEN 1 ELSE 0 END) AS c9`,
        `SUM(CASE WHEN t_source_daily.pct_chg = 0 THEN 1 ELSE 0 END) AS c10`,
        `SUM(CASE WHEN t_source_daily.pct_chg > 0 AND t_source_daily.pct_chg < 1 THEN 1 ELSE 0 END) AS c11`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 1 AND t_source_daily.pct_chg < 2 THEN 1 ELSE 0 END) AS c12`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 2 AND t_source_daily.pct_chg < 3 THEN 1 ELSE 0 END) AS c13`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 3 AND t_source_daily.pct_chg < 4 THEN 1 ELSE 0 END) AS c14`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 4 AND t_source_daily.pct_chg < 5 THEN 1 ELSE 0 END) AS c15`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 5 AND t_source_daily.pct_chg < 6 THEN 1 ELSE 0 END) AS c16`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 6 AND t_source_daily.pct_chg < 7 THEN 1 ELSE 0 END) AS c17`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 7 AND t_source_daily.pct_chg < 8 THEN 1 ELSE 0 END) AS c18`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 8 AND t_source_daily.pct_chg < 9 THEN 1 ELSE 0 END) AS c19`,
        `SUM(CASE WHEN t_source_daily.pct_chg >= 9 THEN 1 ELSE 0 END) AS c20`,
      ])
      .where({
        tradeDate,
        amount: Not(0), // 排除成交量为 0 的股票
      });

    const res = await queryBuilder.getRawOne();
    const result: number[] = [];
    for (let i = 0; i <= 20; i += 1) {
      result.push(res ? +res[`c${i}`] : 0);
    }
    return result;
  }

  /**
   * 连日涨跌统计
   */
  async upDownCount({
    orderField = 'trade_date',
    order = Order.ASC,
    startDate,
    endDate,
  }: DailyQueryDto): Promise<SentiUpDownCountEntity[]> {
    let ret = await this.DailyRepository.createQueryBuilder('t_source_daily')
      .select([
        't_source_daily.tradeDate AS tradeDate',
        'SUM(CASE WHEN t_source_daily.change > 0 THEN 1 ELSE 0 END) AS upCount',
        'SUM(CASE WHEN t_source_daily.change = 0 THEN 1 ELSE 0 END) AS flatCount',
        'SUM(CASE WHEN t_source_daily.change < 0 THEN 1 ELSE 0 END) AS downCount',
      ])
      .where({
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
        amount: Not(0), // 排除成交量为 0 的股票，例如暂停交易的股票、各类ETF
      })
      .groupBy('t_source_daily.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();

    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      upCount: +i.upCount,
      flatCount: +i.flatCount,
      downCount: +i.downCount,
    }));
    return ret;
  }

  async detail(id: number): Promise<DailyEntity> {
    const item = await this.DailyRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: DailyDto) {
    await this.writes.mutate(DailyEntity, 'save', dto);
  }

  async bulkCreate(dto: DailyDto[]) {
    return this.writes.mutate(DailyEntity, 'save', dto);
  }

  async update(id: number, dto: DailyUpdateDto) {
    await this.writes.mutate(DailyEntity, 'update', dto, id);
  }

  async delete(id: number) {
    await this.writes.mutate(DailyEntity, 'delete', undefined, id);
  }

  async deleteByDate(date: DailyDto['tradeDate']) {
    return this.writes.mutate(DailyEntity, 'delete', { tradeDate: date });
  }

  async clear() {
    await this.writes.mutate(DailyEntity, 'clear');
  }

  /**
   * 策略：向上跳空缺口后三连阳
   * @param dates [date4(最新), date3, date2, date1(最早)]
   */
  async findGapThreeUp(
    dates: string[],
    sequence?: Map<string, Record<string, DailyEntity>>,
  ): Promise<DailyEntity[]> {
    const [date4, date3, date2, date1] = dates;
    const map = sequence || (await this.getDailyDataByDates(dates));
    const result: DailyEntity[] = [];

    map.forEach((dailyMap) => {
      const d1 = dailyMap[date1];
      const d2 = dailyMap[date2];
      const d3 = dailyMap[date3];
      const d4 = dailyMap[date4];

      if (!d1 || !d2 || !d3 || !d4) return;

      if (!hasValidStrategySequence([d1, d2, d3, d4])) return;
      if (!meetsCommonStrategyConditions([d2, d3, d4])) return;

      if (
        +d1.high < +d2.low && // 缺口
        +d3.low > +d1.high && // 允许部分回补，但最低价不能触及或跌破D1最高价
        +d4.low > +d1.high &&
        +d2.close > +d2.open && // d2 阳线
        +d3.close > +d3.open && // d3 阳线
        +d4.close > +d4.open // d4 阳线，不要求三天收盘逐日上涨
      ) {
        result.push(d4);
      }
    });

    return result;
  }

  /**
   * 策略：向上跳空缺口后二连阳
   * @param dates [date3(最新), date2, date1(最早)]
   */
  async findGapTwoUp(
    dates: string[],
    sequence?: Map<string, Record<string, DailyEntity>>,
  ): Promise<DailyEntity[]> {
    const [date3, date2, date1] = dates;
    const map = sequence || (await this.getDailyDataByDates(dates));
    const result: DailyEntity[] = [];

    map.forEach((dailyMap) => {
      const d1 = dailyMap[date1];
      const d2 = dailyMap[date2];
      const d3 = dailyMap[date3];

      if (!d1 || !d2 || !d3) return;

      if (!hasValidStrategySequence([d1, d2, d3])) return;
      if (!meetsCommonStrategyConditions([d2, d3])) return;

      if (
        +d1.high < +d2.low && // 缺口
        +d3.low > +d1.high && // 允许部分回补，但最低价不能触及或跌破D1最高价
        +d2.close > +d2.open && // d2 阳线
        +d3.close > +d3.open // d3 阳线，不要求两天收盘逐日上涨
      ) {
        result.push(d3);
      }
    });

    return result;
  }

  /**
   * 策略：向上跳空缺口后连续三日高换手率
   * @param dates [date4(最新), date3, date2, date1(最早)]
   */
  async findGapThreeHighTurnover(
    dates: string[],
    sequence?: Map<string, Record<string, DailyEntity>>,
  ): Promise<DailyEntity[]> {
    const [date4, date3, date2, date1] = dates;
    const map = sequence || (await this.getDailyDataByDates(dates));
    const result: DailyEntity[] = [];

    map.forEach((dailyMap) => {
      const d1 = dailyMap[date1];
      const d2 = dailyMap[date2];
      const d3 = dailyMap[date3];
      const d4 = dailyMap[date4];

      if (!d1 || !d2 || !d3 || !d4) return;

      if (!hasValidStrategySequence([d1, d2, d3, d4])) return;
      if (!meetsCommonStrategyConditions([d2, d3, d4])) return;

      if (
        +d1.high < +d2.low && // 缺口
        +d3.low > +d1.high && // 允许部分回补，但最低价不能触及或跌破D1最高价
        +d4.low > +d1.high &&
        +d2.amount > +d1.amount && // 仅跳空日成交额需高于基准日
        [d2, d3, d4].every(
          (day) =>
            +(day.turnoverRateF || 0) > 5 &&
            Number(day.turnoverRateF) > Number(d1.turnoverRateF),
        ) // 不要求收盘递增或D4收阳
      ) {
        result.push(d4);
      }
    });
    return result;
  }

  /**
   * 策略：连续三日放量收阳
   * 沿用原量比目标3.0、2.1、1.7各下调10%的门槛，且三天均收阳。
   * 仅量比门槛逐日降低，不要求实际量比递减、成交量不下降或收盘逐日上涨。
   * @param dates [date3(最新), date2, date1(最早)]
   */
  async findThreeDaysHighVol(
    dates: string[],
    sequence?: Map<string, Record<string, DailyEntity>>,
  ): Promise<DailyEntity[]> {
    const [date3, date2, date1] = dates;
    const map = sequence || (await this.getDailyDataByDates(dates));
    const result: DailyEntity[] = [];

    map.forEach((dailyMap) => {
      const d1 = dailyMap[date1];
      const d2 = dailyMap[date2];
      const d3 = dailyMap[date3];

      if (!d1 || !d2 || !d3) return;

      if (!hasValidStrategySequence([d1, d2, d3])) return;
      if (!meetsCommonStrategyConditions([d1, d2, d3])) return;

      if (
        +(d1.volumeRatio || 0) > 2.7 &&
        +(d2.volumeRatio || 0) > 1.89 &&
        +(d3.volumeRatio || 0) > 1.53 &&
        +d1.close > +d1.open &&
        +d2.close > +d2.open &&
        +d3.close > +d3.open
      ) {
        result.push(d3);
      }
    });
    return result;
  }

  /**
   * 策略：连续两次向上缺口
   * 两次完整向上缺口，不要求收阳；同样适用统一成交额、收盘位置及涨停条件。
   * @param dates [date3(最新), date2, date1(最早)]
   */
  async findContinuousGap(
    dates: string[],
    sequence?: Map<string, Record<string, DailyEntity>>,
  ): Promise<DailyEntity[]> {
    const [date3, date2, date1] = dates;
    const map = sequence || (await this.getDailyDataByDates(dates));
    const result: DailyEntity[] = [];

    map.forEach((dailyMap) => {
      const d1 = dailyMap[date1];
      const d2 = dailyMap[date2];
      const d3 = dailyMap[date3];

      if (!d1 || !d2 || !d3) return;

      if (!hasValidStrategySequence([d1, d2, d3])) return;
      if (!meetsCommonStrategyConditions([d2, d3])) return;

      if (
        +d2.low > +d1.high && // 昨天最低价高于前天最高价，形成第一个向上缺口
        +d3.low > +d2.high // 今天最低价高于昨天最高价，形成第二个向上缺口
      ) {
        // 返回今天的数据，便于策略页直接展示最新交易日结果
        result.push(d3);
      }
    });

    return result;
  }

  /**
   * 策略：向上跳空上影反包
   * 保留上影幅度>3%的定义，不限制D3相对D2的成交量。
   * @param dates [date3(最新), date2, date1(最早)]
   */
  async findShadowWrap(
    dates: string[],
    sequence?: Map<string, Record<string, DailyEntity>>,
  ): Promise<DailyEntity[]> {
    const [date3, date2, date1] = dates;
    const map = sequence || (await this.getDailyDataByDates(dates));
    const result: DailyEntity[] = [];

    map.forEach((dailyMap) => {
      const d1 = dailyMap[date1];
      const d2 = dailyMap[date2];
      const d3 = dailyMap[date3];

      if (!d1 || !d2 || !d3) return;

      if (!hasValidStrategySequence([d1, d2, d3])) return;
      if (!meetsCommonStrategyConditions([d2, d3])) return;

      if (
        +d2.low > +d1.high && // 第一天形成向上跳空缺口，且当日未回补
        hasUpperShadowAboveThreePercent(d2) && // 整数分精确判断上影幅度严格大于3%
        +d3.close > +d2.high && // 第二天收盘价必须高于第一天最高价
        +d3.low > +d1.high && // 允许部分回补，但最低价不能触及或跌破D1最高价
        +d3.close > +d3.open // 反包日必须收阳
      ) {
        // 返回第二日数据，便于策略页直接展示最新交易日结果
        result.push(d3);
      }
    });

    return result;
  }

  async strategyHistory(dates: string[], visible: string[], codes?: string[]) {
    const sequence = await this.getDailyDataByDates(dates, codes);
    return Promise.all(
      visible.map(async (date) => {
        const window = dates
          .filter((d) => d <= date)
          .slice(-4)
          .reverse();
        const hits = new Map<string, string[]>();
        const checks: [string, Promise<DailyEntity[]>][] = [
          ['gapThreeUp', this.findGapThreeUp(window, sequence)],
          ['gapTwoUp', this.findGapTwoUp(window.slice(0, 3), sequence)],
          [
            'gapThreeHighTurnover',
            this.findGapThreeHighTurnover(window, sequence),
          ],
          [
            'threeDaysHighVol',
            this.findThreeDaysHighVol(window.slice(0, 3), sequence),
          ],
          [
            'continuousGap',
            this.findContinuousGap(window.slice(0, 3), sequence),
          ],
          ['shadowWrap', this.findShadowWrap(window.slice(0, 3), sequence)],
        ];
        const results = await Promise.all(checks.map(([, result]) => result));
        results.forEach((rows, i) =>
          rows.forEach((row) =>
            hits.set(row.tsCode, [
              ...(hits.get(row.tsCode) || []),
              checks[i][0],
            ]),
          ),
        );
        return { date, hits, complete: window.length === 4 };
      }),
    );
  }

  private async getDailyDataByDates(dates: string[], codes?: string[]) {
    if (codes && !codes.length)
      return new Map<string, Record<string, DailyEntity>>();
    const list = await this.DailyRepository.find({
      where: {
        tradeDate: In(dates),
        ...(codes ? { tsCode: In(codes) } : {}),
      },
      // Strategy screening only needs a subset of columns. Restricting the
      // projection avoids fetching the whole wide row set across the network.
      select: [
        'tsCode',
        'tradeDate',
        'name',
        'open',
        'close',
        'high',
        'low',
        'preClose',
        'vol',
        'amount',
        'upLimit',
        'turnoverRateF',
        'volumeRatio',
        'peTtm',
        'totalMv',
        'circMv',
      ],
    });

    const map = new Map<string, Record<string, DailyEntity>>();
    // eslint-disable-next-line no-restricted-syntax
    for (const item of list) {
      if (!map.has(item.tsCode)) {
        map.set(item.tsCode, {});
      }
      map.get(item.tsCode)![item.tradeDate] = item;
    }
    return map;
  }
}
