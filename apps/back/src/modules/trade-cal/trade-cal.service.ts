import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
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
    isOpen,
  }: TradeCalQueryDto): Promise<Pagination<TradeCalEntity>> {
    const queryBuilder = this.TradeCalRepository.createQueryBuilder(
      't_trade_cal',
    ).where({
      ...(calDate && { calDate: Like(`%${calDate}%`) }),
      ...(isOpen && { isOpen: Like(`%${isOpen}%`) }),
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
    await this.TradeCalRepository.save(dto);
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
}
