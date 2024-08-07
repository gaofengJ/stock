import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
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
    tsCode,
    tradeDate,
    startDate,
    endDate,
  }: DailyQueryDto): Promise<Pagination<DailyEntity>> {
    const queryBuilder = this.DailyRepository.createQueryBuilder(
      't_source_daily',
    ).where({
      ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
      ...(tradeDate && { tradeDate }),
      ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
    });
    return paginate(queryBuilder, { pageNum, pageSize });
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
