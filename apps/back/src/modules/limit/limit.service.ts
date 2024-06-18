import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
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
    tsCode,
    name,
  }: LimitQueryDto): Promise<Pagination<LimitEntity>> {
    const queryBuilder = this.LimitRepository.createQueryBuilder(
      't_trade_cal',
    ).where({
      ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
      ...(name && { name: Like(`%${name}%`) }),
    });
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
    await this.LimitRepository.save(dto);
  }

  async update(id: number, dto: LimitUpdateDto) {
    await this.LimitRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.LimitRepository.remove(item);
  }

  async clear() {
    await this.LimitRepository.clear();
  }
}
