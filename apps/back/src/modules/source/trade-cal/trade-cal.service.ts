import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { CommonDateDto } from '@/dto/common.dto';
import { BizException } from '@/exceptions/biz.exception';
import { ECustomError } from '@/types/common.enum';

import { TradeCalEntity } from './trade-cal.entity';

import {
  TradeCalDto,
  TradeCalQueryDto,
  TradeCalUpdateDto,
} from './trade-cal.dto';
import { EIsOpen } from './trade-cal.enum';

@Injectable()
export class TradeCalService {
  constructor(
    private readonly writes: SyncWriteService,
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
    await this.writes.mutate(TradeCalEntity, 'save', dto);
  }

  async bulkCreate(dto: TradeCalDto[]) {
    return this.writes.mutate(TradeCalEntity, 'save', dto);
  }

  async update(id: number, dto: TradeCalUpdateDto) {
    await this.writes.mutate(TradeCalEntity, 'update', dto, id);
  }

  async delete(id: number) {
    await this.writes.mutate(TradeCalEntity, 'delete', undefined, id);
  }

  async clear() {
    await this.writes.mutate(TradeCalEntity, 'clear');
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
    if (!tradeCal) {
      throw new BizException(ECustomError.TRADE_CAL_MISSING);
    }
    return tradeCal.isOpen === EIsOpen.OPENED;
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

  /**
   * 获取过去的 n 个交易日
   */
  async getLastNDays({ date, n }: { date: CommonDateDto['date']; n: number }) {
    const ret = await this.TradeCalRepository.find({
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
