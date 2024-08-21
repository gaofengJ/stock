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
  }: DailyQueryDto): Promise<Pagination<DailyEntity>> {
    const queryBuilder = this.DailyRepository.createQueryBuilder(
      't_source_daily',
    ).where({
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
