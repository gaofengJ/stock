import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import { PermissionEntity } from './entities/permission.entity';
import {
  PermissionDto,
  PermissionQueryDto,
  PermissionUpdateDto,
} from './permission.dto';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(PermissionEntity)
    private PermissionRepository: Repository<PermissionEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    permissionName,
    permissionType,
  }: PermissionQueryDto): Promise<Pagination<PermissionEntity>> {
    const queryBuilder = this.PermissionRepository.createQueryBuilder(
      't_permission',
    ).where({
      ...(permissionName && { permissionName: Like(`%${permissionName}%`) }),
      ...(permissionType && { permissionType }),
    });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<PermissionEntity> {
    const item = await this.PermissionRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: PermissionDto) {
    await this.PermissionRepository.save(dto);
  }

  async bulkCreate(dto: PermissionDto[]) {
    const ret = await this.PermissionRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: PermissionUpdateDto) {
    await this.PermissionRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.PermissionRepository.remove(item);
  }

  async clear() {
    await this.PermissionRepository.clear();
  }
}
