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

import { Pagination } from '@/helper/paginate/pagination';
import { IdParam } from '@/decorators/id-param.decorator';

import { RoleService } from './role.service';
import { RoleEntity } from './entities/role.entity';
import { RoleDto, RoleQueryDto, RoleUpdateDto } from './role.dto';

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
}
