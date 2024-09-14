import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserEntity } from './entities/user.entity';
import { UserRoleEntity } from './entities/user_role.entity';

const services = [UserService];

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity]),
    TypeOrmModule.forFeature([UserRoleEntity]),
  ],
  controllers: [UserController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class UserModule {}
