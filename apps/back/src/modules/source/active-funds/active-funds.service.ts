import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActiveFundsDto, ActiveFundsUpdateDto } from './active-funds.dto';
import { ActiveFundsEntity } from './active-funds.entity';

@Injectable()
export class ActiveFundsService {
  constructor(
    @InjectRepository(ActiveFundsEntity)
    private activeFundsRepository: Repository<ActiveFundsEntity>,
  ) {}

  async list(): Promise<ActiveFundsEntity[]> {
    const ret = this.activeFundsRepository
      .createQueryBuilder('t_source_active_funds')
      .getMany();
    return ret;
  }

  async detail(id: number): Promise<ActiveFundsEntity> {
    const item = await this.activeFundsRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: ActiveFundsDto) {
    await this.activeFundsRepository.save(dto);
  }

  async bulkCreate(dto: ActiveFundsDto[]) {
    const ret = await this.activeFundsRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: ActiveFundsUpdateDto) {
    await this.activeFundsRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.activeFundsRepository.remove(item);
  }

  async clear() {
    await this.activeFundsRepository.clear();
  }
}
