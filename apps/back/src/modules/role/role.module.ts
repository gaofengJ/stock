import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { RoleEntity } from './entities/role.entity';
import { RolePermissionEntity } from './entities/role_permission.entity';

const services = [RoleService];

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity]),
    TypeOrmModule.forFeature([RolePermissionEntity]),
  ],
  controllers: [RoleController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class RoleModule {}
