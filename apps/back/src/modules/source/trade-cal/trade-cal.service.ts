import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { CommonDateDto } from '@/dto/common.dto';

import { TradeCalEntity } from './trade-cal.entity';

import {
  TradeCalDto,
  TradeCalQueryDto,
  TradeCalUpdateDto,
} from './trade-cal.dto';

@Injectable()
export class TradeCalService {
  constructor(
    @InjectRepository(TradeCalEntity)
    private TradeCalRepository: Repository<TradeCalEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    calDate,
    startDate,
    endDate,
    isOpen,
  }: TradeCalQueryDto): Promise<Pagination<TradeCalEntity>> {
    const queryBuilder = this.TradeCalRepository.createQueryBuilder(
      't_source_trade_cal',
    ).where({
      ...(calDate && { calDate }),
      ...(startDate && endDate && { calDate: Between(startDate, endDate) }),
      ...(isOpen && { isOpen }),
    });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<TradeCalEntity> {
    const item = await this.TradeCalRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: TradeCalDto) {
    await this.TradeCalRepository.save(dto);
  }

  async bulkCreate(dto: TradeCalDto[]) {
    const ret = await this.TradeCalRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: TradeCalUpdateDto) {
    await this.TradeCalRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.TradeCalRepository.remove(item);
  }

  async clear() {
    await this.TradeCalRepository.clear();
  }

  /**
   * 查询当前日期是否为交易日
   * @param date
   */
  async isOpen(date: CommonDateDto['date']) {
    const tradeCal = await this.TradeCalRepository.findOne({
      where: {
        ...(date && { calDate: date }),
      },
      select: ['isOpen'],
    });
    return !!(tradeCal?.isOpen || 0);
  }

  /**
   * 查询上一个交易日
   * @param date
   */
  async getPreDate(date: CommonDateDto['date']) {
    const tradeCal = await this.TradeCalRepository.findOne({
      where: {
        ...(date && { calDate: date }),
      },
      select: ['preTradeDate'],
    });
    return tradeCal?.preTradeDate;
  }
}
