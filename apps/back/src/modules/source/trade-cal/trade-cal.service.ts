import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, Repository } from 'typeorm';

import { CommonDateDto } from '@/dto/common.dto';
import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import {
  TradeCalDto,
  TradeCalQueryDto,
  TradeCalUpdateDto,
} from './trade-cal.dto';
import { TradeCalEntity } from './trade-cal.entity';
import { EIsOpen } from './trade-cal.enum';

@Injectable()
export class TradeCalService {
  constructor(
    @InjectRepository(TradeCalEntity)
    private tradeCalRepository: Repository<TradeCalEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    calDate,
    startDate,
    endDate,
    isOpen,
  }: TradeCalQueryDto): Promise<Pagination<TradeCalEntity>> {
    const queryBuilder = this.tradeCalRepository
      .createQueryBuilder('t_source_trade_cal')
      .where({
        ...(calDate && { calDate }),
        ...(startDate && endDate && { calDate: Between(startDate, endDate) }),
        ...(isOpen && { isOpen }),
      });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<TradeCalEntity> {
    const item = await this.tradeCalRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: TradeCalDto) {
    await this.tradeCalRepository.save(dto);
  }

  async bulkCreate(dto: TradeCalDto[]) {
    const ret = await this.tradeCalRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: TradeCalUpdateDto) {
    await this.tradeCalRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.tradeCalRepository.remove(item);
  }

  async clear() {
    await this.tradeCalRepository.clear();
  }

  /**
   * 查询当前日期是否为交易日
   * @param date
   */
  async isOpen(date: CommonDateDto['date']) {
    const tradeCal = await this.tradeCalRepository.findOne({
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
    const tradeCal = await this.tradeCalRepository.findOne({
      where: {
        ...(date && { calDate: date }),
      },
      select: ['preTradeDate'],
    });
    return tradeCal?.preTradeDate;
  }

  /**
   * 获取过去的 n 个交易日
   */
  async getLastNDays({ date, n }: { date: CommonDateDto['date']; n: number }) {
    const ret = await this.tradeCalRepository.find({
      where: {
        ...(date && { calDate: LessThanOrEqual(date) }),
        isOpen: EIsOpen.OPENED,
      },
      order: {
        calDate: 'DESC', // 按日期降序排列
      },
      take: n,
      select: ['calDate'],
    });
    return ret;
  }
}
