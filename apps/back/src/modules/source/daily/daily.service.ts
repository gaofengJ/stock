import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Not, Repository } from 'typeorm';

import * as dayjs from 'dayjs';
import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { Order } from '@/dto/pager.dto';
import { SentiUpDownCountEntity } from '@/modules/analysis/senti/senti.entity';

import { DailyEntity } from './daily.entity';
import { DailyDto, DailyQueryDto, DailyUpdateDto } from './daily.dto';

@Injectable()
export class DailyService {
  constructor(
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
    await this.DailyRepository.save(dto);
  }

  async bulkCreate(dto: DailyDto[]) {
    const list = await this.DailyRepository.save(dto);
    return list.length;
  }

  async update(id: number, dto: DailyUpdateDto) {
    await this.DailyRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.DailyRepository.remove(item);
  }

  async deleteByDate(date: DailyDto['tradeDate']) {
    const { affected } = await this.DailyRepository.delete({
      tradeDate: date,
    });
    return affected || 0;
  }

  async clear() {
    await this.DailyRepository.clear();
  }
}
