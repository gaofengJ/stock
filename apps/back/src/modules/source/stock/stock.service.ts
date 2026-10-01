import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { SectorService } from '@/modules/analysis/market/sector.service';
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
    @Optional() private sectors?: SectorService,
  ) {}

  async list({
    pageNum,
    pageSize,
    tsCode,
    name,
    market,
    listStatus,
    isHs,
    sector,
    date,
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
    if (sector && this.sectors) {
      const codes = [...(await this.sectors.codes(sector, date))];
      queryBuilder.andWhere(
        codes.length ? 't_source_stock.tsCode IN (:...codes)' : '1=0',
        { codes },
      );
    }
    const result = await paginate(queryBuilder, { pageNum, pageSize });
    return new Pagination(
      this.sectors
        ? await this.sectors.decorate(result.items, date)
        : result.items,
      result.meta,
    );
  }

  async detail(id: number): Promise<StockEntity> {
    const item = await this.stockBasicRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return this.sectors ? (await this.sectors.decorate([item]))[0] : item;
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
