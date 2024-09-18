import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import { UserEntity } from './entities/user.entity';

import {
  UserDto,
  UserQueryDto,
  UserRoleDto,
  UserRoleQueryDto,
  UserRoleUpdateDto,
  UserUpdateDto,
} from './user.dto';
import { UserRoleEntity } from './entities/user_role.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private UserRepository: Repository<UserEntity>,
    @InjectRepository(UserRoleEntity)
    private UserRoleRepository: Repository<UserRoleEntity>,
  ) {}

  async list({
    pageNum,
    pageSize,
    username,
    phone,
  }: UserQueryDto): Promise<Pagination<UserEntity>> {
    const queryBuilder = this.UserRepository.createQueryBuilder('t_user').where(
      {
        ...(username && { username: Like(`%${username}%`) }),
        ...(phone && { phone: Like(`%${phone}%`) }),
      },
    );
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async detail(id: number): Promise<UserEntity> {
    const item = await this.UserRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async create(dto: UserDto) {
    await this.UserRepository.save(dto);
  }

  async bulkCreate(dto: UserDto[]) {
    const ret = await this.UserRepository.save(dto);
    return ret?.length || 0;
  }

  async update(id: number, dto: UserUpdateDto) {
    await this.UserRepository.update(id, dto);
  }

  async delete(id: number) {
    const item = await this.detail(id);
    await this.UserRepository.remove(item);
  }

  async clear() {
    await this.UserRepository.clear();
  }

  async userRoleList({
    pageNum,
    pageSize,
    userId,
    roleId,
  }: UserRoleQueryDto): Promise<Pagination<UserRoleEntity>> {
    const queryBuilder = this.UserRoleRepository.createQueryBuilder(
      't_user_role',
    ).where({
      ...(userId && { userId }),
      ...(roleId && { roleId }),
    });
    return paginate(queryBuilder, { pageNum, pageSize });
  }

  async userRoleDetail(id: number): Promise<UserRoleEntity> {
    const item = await this.UserRoleRepository.findOneBy({ id });
    if (!item) throw new NotFoundException('未找到该记录');
    return item;
  }

  async userRoleCreate(dto: UserRoleDto) {
    await this.UserRoleRepository.save(dto);
  }

  async userRoleBulkCreate(dto: UserRoleDto[]) {
    const ret = await this.UserRoleRepository.save(dto);
    return ret?.length || 0;
  }

  async userRoleUpdate(id: number, dto: UserRoleUpdateDto) {
    await this.UserRoleRepository.update(id, dto);
  }

  async userRoleDelete(id: number) {
    const item = await this.userRoleDetail(id);
    await this.UserRoleRepository.remove(item);
  }

  async userRoleClear() {
    await this.UserRoleRepository.clear();
  }
}
