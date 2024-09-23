import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PermissionModule } from '../permission/permission.module';

import { RoleEntity } from './entities/role.entity';
import { RolePermissionEntity } from './entities/role_permission.entity';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';

const services = [RoleService];

@Module({
  imports: [
    TypeOrmModule.forFeature([RoleEntity, RolePermissionEntity]),
    PermissionModule,
  ],
  controllers: [RoleController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class RoleModule {}
