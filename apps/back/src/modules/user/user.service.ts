import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import { RoleService } from '../role/role.service';

import { UserEntity } from './entities/user.entity';
import { UserRoleEntity } from './entities/user_role.entity';
import {
  UserDto,
  UserQueryDto,
  UserRoleDto,
  UserRoleQueryDto,
  UserRoleUpdateDto,
  UserUpdateDto,
} from './user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,

    @InjectRepository(UserRoleEntity)
    private userRoleRepository: Repository<UserRoleEntity>,

    private readonly roleService: RoleService,
  ) {}

  async list({
    pageNum,
    pageSize,
    username,
    phone,
  }: UserQueryDto): Promise<Pagination<UserEntity>> {
    const queryBuilder = this.userRepository
      .createQueryBuilder('t_user')
      .where({
        ...(username && { username: Like(`%${username}%`) }),
        ...(phone && { phone: Like(`%${phone}%`) }),
      });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<UserEntity> {
    const item = await this.userRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: UserDto) {
    await this.userRepository.save(dto);
  }

  async bulkCreate(dto: UserDto[]) {
    const ret = await this.userRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: UserUpdateDto) {
    await this.userRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.userRepository.remove(item);
  }

  async clear() {
    await this.userRepository.clear();
  }

  /**
   * @description 根据用户名获取用户
   * @param username 用户名
   * @returns UserEntity
   */
  async getUserByUsername(username: string) {
    const user = await this.userRepository.findOne({
      where: {
        username,
      },
    });
    return user;
  }

  async userRoleList({
    pageNum,
    pageSize,
    userId,
    roleId,
  }: UserRoleQueryDto): Promise<Pagination<UserRoleEntity>> {
    const queryBuilder = this.userRoleRepository
      .createQueryBuilder('t_user_role')
      .where({
        ...(userId && { userId }),
        ...(roleId && { roleId }),
      });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async userRoleDetail(id: number): Promise<UserRoleEntity> {
    const item = await this.userRoleRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async userRoleCreate(dto: UserRoleDto) {
    await this.userRoleRepository.save(dto);
  }

  async userRoleBulkCreate(dto: UserRoleDto[]) {
    const ret = await this.userRoleRepository.save(dto);
    return ret?.length || 0;
  }

  async userRoleUpdate(id: number, dto: UserRoleUpdateDto) {
    await this.userRoleRepository.update(id, dto);
  }

  async userRoleDelete(id: number) {
    const item = await this.userRoleDetail(id);
    await this.userRoleRepository.remove(item);
  }

  async userRoleClear() {
    await this.userRoleRepository.clear();
  }

  /**
   * 根据 userId 查询用户所有角色
   */
  async getRolesByUserId(userId: number) {
    const userRoles = await this.userRoleRepository.find({
      where: { userId },
    });

    if (!userRoles.length) return []; // 如果用户没有分配角色，则返回空数组

    const roleIds = userRoles.map((i) => i.roleId);

    const { items: roles } = await this.roleService.list({
      pageNum: 1,
      pageSize: 100,
    });

    return roles.filter((i) => roleIds.includes(i.id));
  }
}
