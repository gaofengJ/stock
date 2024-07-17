import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { Order } from '@/dto/pager.dto';

import { LimitEntity } from './limit.entity';
import { LimitDto, LimitQueryDto, LimitUpdateDto } from './limit.dto';

@Injectable()
export class LimitService {
  constructor(
    @InjectRepository(LimitEntity)
    private LimitRepository: Repository<LimitEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    field = 'ts_code',
    order = Order.ASC,
    tsCode,
    name,
    startDate,
    endDate,
  }: LimitQueryDto): Promise<Pagination<LimitEntity>> {
    const queryBuilder = this.LimitRepository.createQueryBuilder(
      't_source_limit',
    )
      .where({
        ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
        ...(name && { name: Like(`%${name}%`) }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .orderBy(field, order);
    return paginate(queryBuilder, { pageNum, pageSize });
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
    await this.LimitRepository.delete({
      tradeDate: date,
    });
  }

  async clear() {
    await this.LimitRepository.clear();
  }
}
