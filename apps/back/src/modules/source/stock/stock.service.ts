import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
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
    private readonly writes: SyncWriteService,
    @InjectRepository(StockEntity)
    private stockBasicRepository: Repository<StockEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    tsCode,
    name,
    market,
    listStatus,
    isHs,
  }: StockQueryDto): Promise<Pagination<StockEntity>> {
    const queryBuilder = this.stockBasicRepository
      .createQueryBuilder('t_source_stock')
      .where({
        ...(tsCode && { tsCode: Like(`%${tsCode}%`) }),
        ...(name && { name: Like(`%${name}%`) }),
        ...(market && { market }),
        ...(listStatus && { listStatus }),
        ...(isHs && { isHs }),
      });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<StockEntity> {
    const item = await this.stockBasicRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: StockDto) {
    await this.writes.mutate(StockEntity, 'save', dto);
  }

  async bulkCreate(dto: StockDto[]) {
    return this.writes.mutate(StockEntity, 'save', dto);
  }

  async update(id: number, dto: StockUpdateDto) {
    await this.writes.mutate(StockEntity, 'update', dto, id);
  }

  async delete(id: number) {
    await this.writes.mutate(StockEntity, 'delete', undefined, id);
  }

  async clear() {
    await this.writes.mutate(StockEntity, 'clear');
  }
}
