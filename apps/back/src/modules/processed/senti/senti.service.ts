import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SentiEntity } from './senti.entity';

import { SentiDto, SentiQueryDto, SentiUpdateDto } from './senti.dto';

@Injectable()
export class SentiService {
  constructor(
    @InjectRepository(SentiEntity)
    private SentiRepository: Repository<SentiEntity>,
  ) {}

  async list({
    tradeDate,
    startDate,
    endDate,
  }: SentiQueryDto): Promise<SentiEntity[]> {
    const query = this.SentiRepository.createQueryBuilder('t_senti');

    if (tradeDate) {
      query.where('t_senti.tradeDate = :tradeDate', { tradeDate });
    } else if (startDate && endDate) {
      query.where('t_senti.tradeDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else {
      // 默认返回最近30条数据，防止全表扫描
      query.limit(30);
    }

    query.orderBy('t_senti.tradeDate', 'ASC');

    const ret = await query.getMany();
    return ret;
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

  async deleteByDate(date: SentiDto['tradeDate']) {
    const { affected } = await this.SentiRepository.delete({
      tradeDate: date,
    });
    return affected;
  }

  async clear() {
    await this.SentiRepository.clear();
  }
}
