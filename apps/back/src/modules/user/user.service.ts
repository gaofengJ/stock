import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';

import { paginate } from '@/helper/paginate/index';
import { Pagination } from '@/helper/paginate/pagination';

import { UserEntity } from './entities/user.entity';

import { UserDto, UserQueryDto, UserUpdateDto } from './user.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private UserRepository: Repository<UserEntity>,
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
}
