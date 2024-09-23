import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleModule } from '../role/role.module';

import { UserEntity } from './entities/user.entity';
import { UserRoleEntity } from './entities/user_role.entity';
import { UserController } from './user.controller';
import { UserService } from './user.service';

const services = [UserService];

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, UserRoleEntity]), RoleModule],
  controllers: [UserController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class UserModule {}
