import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Repository } from 'typeorm';

import * as dayjs from 'dayjs';
import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { Order } from '@/dto/pager.dto';
import {
  ChainsCountLimitUpTimesEntity,
  ChainsLimitUpAmountEntity,
} from '@/modules/analysis/chains/chains.entity';
import {
  SentiLimitUpDownCountEntity,
  SentiLimitUpMaxTimesCountEntity,
} from '@/modules/analysis/senti/senti.entity';

import { LimitEntity } from './limit.entity';
import { LimitDto, LimitQueryDto, LimitUpdateDto } from './limit.dto';
import { ELimit } from './limit.enum';

@Injectable()
export class LimitService {
  constructor(
    @InjectRepository(LimitEntity)
    private LimitRepository: Repository<LimitEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    orderField = 'ts_code',
    order = Order.ASC,
    fields,
    tsCode,
    name,
    limit,
    limitTimes,
    tradeDate,
    startDate,
    endDate,
  }: LimitQueryDto): Promise<Pagination<LimitEntity>> {
    let queryBuilder =
      this.LimitRepository.createQueryBuilder('t_source_limit');
    if (fields?.length) {
      queryBuilder = queryBuilder.select(
        fields.map((i: string) => `t_source_limit.${i}`),
      );
    }
    queryBuilder = queryBuilder
      .where({
        ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
        ...(name && { name: Like(`%${name}%`) }),
        ...(limit && { limit }),
        ...(limitTimes && { limitTimes }),
        ...(tradeDate && { tradeDate }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .orderBy(orderField, order);
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  /**
   * 连日涨跌停统计
   */
  async limitUpDownCount({
    orderField = 'trade_date',
    order = Order.ASC,
    startDate,
    endDate,
  }: LimitQueryDto): Promise<SentiLimitUpDownCountEntity[]> {
    let ret = await this.LimitRepository.createQueryBuilder('t_source_limit')
      .select([
        't_source_limit.tradeDate AS tradeDate',
        `SUM(CASE WHEN t_source_limit.limit = '${ELimit.U}' THEN 1 ELSE 0 END) AS limitUCount`,
        `SUM(CASE WHEN t_source_limit.limit = '${ELimit.D}' THEN 1 ELSE 0 END) AS limitDCount`,
        `SUM(CASE WHEN t_source_limit.limit = '${ELimit.Z}' THEN 1 ELSE 0 END) AS limitZCount`,
      ])
      .where({
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .groupBy('t_source_limit.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();

    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      limitUCount: +i.limitUCount,
      limitDCount: +i.limitDCount,
      limitZCount: +i.limitZCount,
    }));
    return ret;
  }

  /**
   * 连日涨停板高度统计
   */
  async limitUpMaxTimesCount({
    orderField = 'trade_date',
    order = Order.ASC,
    startDate,
    endDate,
  }: LimitQueryDto): Promise<SentiLimitUpMaxTimesCountEntity[]> {
    let ret = await this.LimitRepository.createQueryBuilder('t_source_limit')
      .select([
        't_source_limit.tradeDate AS tradeDate',
        'MAX(t_source_limit.limit_times) AS maxLimitTimes',
      ])
      .where({
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .groupBy('t_source_limit.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();

    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      maxLimitTimes: +i.maxLimitTimes,
    }));
    return ret;
  }

  /**
   * 连日 n 连板数量统计
   */
  async countTimes({
    orderField = 'trade_date',
    order = Order.ASC,
    limit = 'U',
    limitTimes,
    startDate,
    endDate,
    zeroOpenTimes,
  }: LimitQueryDto): Promise<ChainsCountLimitUpTimesEntity[]> {
    let ret = await this.LimitRepository.createQueryBuilder('t_source_limit')
      .select([
        't_source_limit.tradeDate AS tradeDate',
        'COUNT(t_source_limit.tradeDate) as count',
      ])
      .where({
        ...(limit && { limit }),
        ...(limitTimes && { limitTimes }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
        ...(zeroOpenTimes && { openTimes: 0 }), // 打开次数为0，代表未开板
      })
      .groupBy('t_source_limit.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();
    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      count: +i.count,
    }));
    return ret;
  }

  /**
   * 连日 n+ 连板数量统计
   */
  async countAboveTimes({
    orderField = 'trade_date',
    order = Order.ASC,
    limit = 'U',
    limitTimes,
    startDate,
    endDate,
    zeroOpenTimes,
  }: LimitQueryDto): Promise<ChainsCountLimitUpTimesEntity[]> {
    let ret = await this.LimitRepository.createQueryBuilder('t_source_limit')
      .select([
        't_source_limit.tradeDate AS tradeDate',
        'COUNT(t_source_limit.tradeDate) as count',
      ])
      .where({
        ...(limit && { limit }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
        ...(zeroOpenTimes && { openTimes: 0 }), // 打开次数为0，代表未开板
      })
      .andWhere('t_source_limit.limitTimes >= :limitTimes', { limitTimes })
      .groupBy('t_source_limit.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();

    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      count: +i.count,
    }));

    return ret;
  }

  /**
   * 涨停参与金额
   */
  async limitUpAmount({
    orderField = 'trade_date',
    order = Order.ASC,
    limit = 'U',
    startDate,
    endDate,
  }: LimitQueryDto): Promise<ChainsLimitUpAmountEntity[]> {
    let ret = await this.LimitRepository.createQueryBuilder('t_source_limit')
      .select([
        't_source_limit.tradeDate AS tradeDate',
        'SUM(t_source_limit.amount) as totalAmount',
      ])
      .where({
        ...(limit && { limit }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .groupBy('t_source_limit.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();

    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      totalAmount: +i.totalAmount,
    }));

    return ret;
  }

  /**
   * 连板参与金额
   */
  async upgradeLimitUpAmount({
    orderField = 'trade_date',
    order = Order.ASC,
    limit = 'U',
    startDate,
    endDate,
  }: LimitQueryDto): Promise<ChainsLimitUpAmountEntity[]> {
    let ret = await this.LimitRepository.createQueryBuilder('t_source_limit')
      .select([
        't_source_limit.tradeDate AS tradeDate',
        'SUM(t_source_limit.amount) as totalAmount',
      ])
      .where({
        ...(limit && { limit }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .andWhere('t_source_limit.limitTimes > 1')
      .groupBy('t_source_limit.tradeDate')
      .orderBy(orderField, order)
      .getRawMany();

    ret = ret.map((i) => ({
      tradeDate: dayjs(i.tradeDate).format('YYYY-MM-DD'),
      totalAmount: +i.totalAmount,
    }));

    return ret;
  }

  async detail(id: number): Promise<LimitEntity> {
    const item = await this.LimitRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: LimitDto) {
    await this.LimitRepository.save(dto);
  }

  async bulkCreate(dto: LimitDto[]) {
    const list = await this.LimitRepository.save(dto);
    return list.length;
  }

  async update(id: number, dto: LimitUpdateDto) {
    await this.LimitRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.LimitRepository.remove(item);
  }

  async deleteByDate(date: LimitDto['tradeDate']) {
    const { affected } = await this.LimitRepository.delete({
      tradeDate: date,
    });
    return affected || 0;
  }

  async clear() {
    await this.LimitRepository.clear();
  }
}
