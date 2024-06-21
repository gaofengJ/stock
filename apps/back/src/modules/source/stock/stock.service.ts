import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { StockEntity } from './stock.entity';

import { StockDto, StockQueryDto, StockUpdateDto } from './stock.dto';

@Injectable()
export class StockService {
  constructor(
    @InjectRepository(StockEntity)
    private stockBasicRepository: Repository<StockEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    tsCode,
    name,
  }: StockQueryDto): Promise<Pagination<StockEntity>> {
    const queryBuilder = this.stockBasicRepository
      .createQueryBuilder('t_source_stock')
      .where({
        ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
        ...(name && { name: Like(`%${name}%`) }),
      });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<StockEntity> {
    const item = await this.stockBasicRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: StockDto) {
    await this.stockBasicRepository.save(dto);
  }

  async bulkCreate(dto: StockDto[]) {
    await this.stockBasicRepository.save(dto);
  }

  async update(id: number, dto: StockUpdateDto) {
    await this.stockBasicRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.stockBasicRepository.remove(item);
  }

  async clear() {
    await this.stockBasicRepository.clear();
  }
}
