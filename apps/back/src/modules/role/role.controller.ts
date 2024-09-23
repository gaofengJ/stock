import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { IdParam } from '@/decorators/id-param.decorator';
import { Pagination } from '@/helper/paginate/pagination';

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
import { RoleService } from './role.service';

@ApiTags('角色信息')
@Controller('role')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取Role列表' })
  @ApiResult({ type: [RoleEntity], isPage: true })
  async list(@Query() dto: RoleQueryDto): Promise<Pagination<RoleEntity>> {
    return this.roleService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取Role详情' })
  @ApiResult({ type: RoleEntity })
  async info(@IdParam() id: number): Promise<RoleEntity> {
    return this.roleService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建Role' })
  async create(@Body() dto: RoleDto) {
    await this.roleService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建Role' })
  async bulkCreate(@Body() dto: RoleDto[]) {
    await this.roleService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Role' })
  async update(@IdParam() id: number, @Body() dto: RoleUpdateDto) {
    await this.roleService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Role' })
  async delete(@IdParam() id: number) {
    await this.roleService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空Role' })
  async clear() {
    await this.roleService.clear();
  }

  @Get('/rolePermission/list')
  @ApiOperation({ summary: '获取RolePermission列表' })
  @ApiResult({ type: [RolePermissionEntity], isPage: true })
  async rolePermissionList(
    @Query() dto: RolePermissionQueryDto,
  ): Promise<Pagination<RolePermissionEntity>> {
    return this.roleService.rolePermissionList(dto);
  }

  @Get('/rolePermission/:id')
  @ApiOperation({ summary: '获取RolePermission详情' })
  @ApiResult({ type: RolePermissionEntity })
  async rolePermissionDetail(
    @IdParam() id: number,
  ): Promise<RolePermissionEntity> {
    return this.roleService.rolePermissionDetail(id);
  }

  @Post('/rolePermission/create')
  @ApiOperation({ summary: '创建RolePermission' })
  async rolePermissionCreate(@Body() dto: RolePermissionDto) {
    await this.roleService.rolePermissionCreate(dto);
  }

  @Post('/rolePermission/bulk-create')
  @ApiOperation({ summary: '批量创建RolePermission' })
  async rolePermissionBulkCreate(@Body() dto: RolePermissionDto[]) {
    await this.roleService.rolePermissionBulkCreate(dto);
  }

  @Put('/rolePermission/:id')
  @ApiOperation({ summary: '更新RolePermission' })
  async rolePermissionUpdate(
    @IdParam() id: number,
    @Body() dto: RolePermissionUpdateDto,
  ) {
    await this.roleService.rolePermissionUpdate(id, dto);
  }

  @Delete('/rolePermission/:id')
  @ApiOperation({ summary: '删除RolePermission' })
  async rolePermissionDelete(@IdParam() id: number) {
    await this.roleService.rolePermissionDelete(id);
  }

  @Delete('/rolePermission/clear')
  @ApiOperation({ summary: '清空RolePermission' })
  async rolePermissionClear() {
    await this.roleService.rolePermissionClear();
  }
}
