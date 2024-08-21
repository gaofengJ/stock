import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

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
    const ret = this.SentiRepository.createQueryBuilder('t_senti')
      .where({
        ...(tradeDate && { tradeDate }),
        ...(startDate && endDate && { tradeDate: Between(startDate, endDate) }),
      })
      .getMany();
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
