import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';
import { StockBasicEntity } from './stock-basic.entity';

import {
  StockBasicDto,
  StockBasicQueryDto,
  StockBasicUpdateDto,
} from './stock-basic.dto';

@Injectable()
export class StockBasicService {
  constructor(
    @InjectRepository(StockBasicEntity)
    private stockBasicRepository: Repository<StockBasicEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
  }: StockBasicQueryDto): Promise<Pagination<StockBasicEntity>> {
    return paginate(this.stockBasicRepository, { pageNum, pageSize });
  }

  async detail(id: number): Promise<StockBasicEntity> {
    const item = await this.stockBasicRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');

    return item;
  }

  async create(dto: StockBasicDto) {
    await this.stockBasicRepository.save(dto);
  }

  async update(id: number, dto: StockBasicUpdateDto) {
    await this.stockBasicRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);

    await this.stockBasicRepository.remove(item);
  }
}
