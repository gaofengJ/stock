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

import { PermissionEntity } from './entities/permission.entity';
import {
  PermissionDto,
  PermissionQueryDto,
  PermissionUpdateDto,
} from './permission.dto';
import { PermissionService } from './permission.service';

@ApiTags('权限信息')
@Controller('permission')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取Permission列表' })
  @ApiResult({ type: [PermissionEntity], isPage: true })
  async list(
    @Query() dto: PermissionQueryDto,
  ): Promise<Pagination<PermissionEntity>> {
    return this.permissionService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取Permission详情' })
  @ApiResult({ type: PermissionEntity })
  async info(@IdParam() id: number): Promise<PermissionEntity> {
    return this.permissionService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建Permission' })
  async create(@Body() dto: PermissionDto) {
    await this.permissionService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建Permission' })
  async bulkCreate(@Body() dto: PermissionDto[]) {
    await this.permissionService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Permission' })
  async update(@IdParam() id: number, @Body() dto: PermissionUpdateDto) {
    await this.permissionService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Permission' })
  async delete(@IdParam() id: number) {
    await this.permissionService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空Permission' })
  async clear() {
    await this.permissionService.clear();
  }
}
