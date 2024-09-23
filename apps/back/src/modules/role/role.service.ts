import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import { PermissionService } from '../permission/permission.service';

import { RoleEntity } from './entities/role.entity';
import { RolePermissionEntity } from './entities/role_permission.entity';
import {
  RoleDto,
  RolePermissionDto,
  RolePermissionQueryDto,
  RolePermissionUpdateDto,
  RoleQueryDto,
  RoleUpdateDto,
} from './role.dto';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(RoleEntity)
    private RoleRepository: Repository<RoleEntity>,

    @InjectRepository(RolePermissionEntity)
    private RolePermissionRepository: Repository<RolePermissionEntity>,

    private permissionService: PermissionService,
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

  async rolePermissionList({
    pageNum,
    pageSize,
    roleId,
    permissionId,
  }: RolePermissionQueryDto): Promise<Pagination<RolePermissionEntity>> {
    const queryBuilder = this.RolePermissionRepository.createQueryBuilder(
      't_role_permission',
    ).where({
      ...(roleId && { roleId }),
      ...(permissionId && { permissionId }),
    });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async rolePermissionDetail(id: number): Promise<RolePermissionEntity> {
    const item = await this.RolePermissionRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async rolePermissionCreate(dto: RolePermissionDto) {
    await this.RolePermissionRepository.save(dto);
  }

  async rolePermissionBulkCreate(dto: RolePermissionDto[]) {
    const ret = await this.RolePermissionRepository.save(dto);
    return ret?.length || 0;
  }

  async rolePermissionUpdate(id: number, dto: RolePermissionUpdateDto) {
    await this.RolePermissionRepository.update(id, dto);
  }

  async rolePermissionDelete(id: number) {
    const item = await this.rolePermissionDetail(id);
    await this.RolePermissionRepository.remove(item);
  }

  async rolePermissionClear() {
    await this.RolePermissionRepository.clear();
  }

  /**
   * 根据 roles 查询所有权限
   */
  async getPermissionsByRoles(roles: number[]) {
    const rolePermissions = await this.RolePermissionRepository.find({
      where: {
        roleId: In(roles),
      },
    });

    if (!rolePermissions.length) return []; // 如果角色没有分配权限，则返回空数组

    const permissionIds = rolePermissions.map((i) => i.permissionId);

    const { items: permissions } = await this.permissionService.list({
      pageNum: 1,
      pageSize: 100,
    });

    return permissions.filter((i) => permissionIds.includes(i.id));
  }
}