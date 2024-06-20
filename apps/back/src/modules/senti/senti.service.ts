import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { SentiEntity } from './senti.entity';

import { SentiDto, SentiQueryDto, SentiUpdateDto } from './senti.dto';

@Injectable()
export class SentiService {
  constructor(
    @InjectRepository(SentiEntity)
    private SentiRepository: Repository<SentiEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    tradeDate,
  }: SentiQueryDto): Promise<Pagination<SentiEntity>> {
    const queryBuilder = this.SentiRepository.createQueryBuilder(
      't_senti',
    ).where({
      ...(tradeDate && { tradeDate }),
    });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<SentiEntity> {
    const item = await this.SentiRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: SentiDto) {
    await this.SentiRepository.save(dto);
  }

  async bulkCreate(dto: SentiDto[]) {
    await this.SentiRepository.save(dto);
  }

  async update(id: number, dto: SentiUpdateDto) {
    await this.SentiRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.SentiRepository.remove(item);
  }

  async clear() {
    await this.SentiRepository.clear();
  }
}
