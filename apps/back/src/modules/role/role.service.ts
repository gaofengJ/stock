import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import { RoleEntity } from './entities/role.entity';

import { RoleDto, RoleQueryDto, RoleUpdateDto } from './role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private RoleRepository: Repository<RoleEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    roleName,
  }: RoleQueryDto): Promise<Pagination<RoleEntity>> {
    const queryBuilder = this.RoleRepository.createQueryBuilder('t_role').where(
      {
        ...(roleName && { roleName }),
      },
    );
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<RoleEntity> {
    const item = await this.RoleRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: RoleDto) {
    await this.RoleRepository.save(dto);
  }

  async bulkCreate(dto: RoleDto[]) {
    const ret = await this.RoleRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: RoleUpdateDto) {
    await this.RoleRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.RoleRepository.remove(item);
  }

  async clear() {
    await this.RoleRepository.clear();
  }
}
