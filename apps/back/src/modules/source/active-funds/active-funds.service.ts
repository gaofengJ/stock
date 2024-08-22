import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActiveFundsEntity } from './active-funds.entity';

import { ActiveFundsDto, ActiveFundsUpdateDto } from './active-funds.dto';

@Injectable()
export class ActiveFundsService {
  constructor(
    @InjectRepository(ActiveFundsEntity)
    private ActiveFundsRepository: Repository<ActiveFundsEntity>,
  ) {}

  async list(): Promise<ActiveFundsEntity[]> {
    const ret = this.ActiveFundsRepository.createQueryBuilder(
      't_source_active_funds',
    ).getRawMany();
    return ret;
  }

  async detail(id: number): Promise<ActiveFundsEntity> {
    const item = await this.ActiveFundsRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: ActiveFundsDto) {
    await this.ActiveFundsRepository.save(dto);
  }

  async bulkCreate(dto: ActiveFundsDto[]) {
    const ret = await this.ActiveFundsRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: ActiveFundsUpdateDto) {
    await this.ActiveFundsRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.ActiveFundsRepository.remove(item);
  }

  async clear() {
    await this.ActiveFundsRepository.clear();
  }
}
