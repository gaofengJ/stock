import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ActiveFundsEntity } from './active-funds.entity';

import { ActiveFundsDto, ActiveFundsUpdateDto } from './active-funds.dto';

@Injectable()
export class ActiveFundsService {
  constructor(
    private readonly writes: SyncWriteService,
    @InjectRepository(ActiveFundsEntity)
    private ActiveFundsRepository: Repository<ActiveFundsEntity>,
  ) {}

  async list(): Promise<ActiveFundsEntity[]> {
    const ret = this.ActiveFundsRepository.createQueryBuilder(
      't_source_active_funds',
    ).getMany();
    return ret;
  }

  async detail(id: number): Promise<ActiveFundsEntity> {
    const item = await this.ActiveFundsRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: ActiveFundsDto) {
    await this.writes.mutate(ActiveFundsEntity, 'save', dto);
  }

  async bulkCreate(dto: ActiveFundsDto[]) {
    return this.writes.mutate(ActiveFundsEntity, 'save', dto);
  }

  async update(id: number, dto: ActiveFundsUpdateDto) {
    await this.writes.mutate(ActiveFundsEntity, 'update', dto, id);
  }

  async delete(id: number) {
    await this.writes.mutate(ActiveFundsEntity, 'delete', undefined, id);
  }

  async clear() {
    await this.writes.mutate(ActiveFundsEntity, 'clear');
  }
}
