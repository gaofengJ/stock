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
// import {
//   Perm,
//   definePermission,
// } from '@/modules/auth/decorators/permission.decorator';
// import { Resource } from '@/modules/auth/decorators/resource.decorator';

// import { ResourceGuard } from '~/modules/auth/guards/resource.guard';
import { LimitEntity } from './limit.entity';

import { LimitDto, LimitQueryDto, LimitUpdateDto } from './limit.dto';
import { LimitService } from './limit.service';

// export const permissions = definePermission('Limit', {
//   LIST: 'list',
//   CREATE: 'create',
//   READ: 'read',
//   UPDATE: 'update',
//   DELETE: 'delete',
// } as const);

@ApiTags('源数据 - Limit模块')
// @UseGuards(ResourceGuard)
@Controller('limit')
export class LimitController {
  constructor(private readonly tradeCalService: LimitService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取Limit列表' })
  @ApiResult({ type: [LimitEntity], isPage: true })
  // @Perm(permissions.LIST)
  async list(@Query() dto: LimitQueryDto): Promise<Pagination<LimitEntity>> {
    return this.tradeCalService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取Limit详情' })
  @ApiResult({ type: LimitEntity })
  // @Perm(permissions.READ)
  async info(@IdParam() id: number): Promise<LimitEntity> {
    return this.tradeCalService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建Limit' })
  // @Perm(permissions.CREATE)
  async create(@Body() dto: LimitDto) {
    await this.tradeCalService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建Limit' })
  async bulkCreate(@Body() dto: LimitDto[]) {
    await this.tradeCalService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Limit' })
  // @Perm(permissions.UPDATE)
  // @Resource(LimitEntity)
  async update(@IdParam() id: number, @Body() dto: LimitUpdateDto) {
    await this.tradeCalService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Limit' })
  // @Perm(permissions.DELETE)
  // @Resource(LimitEntity)
  async delete(@IdParam() id: number) {
    await this.tradeCalService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空Limit' })
  async clear() {
    await this.tradeCalService.clear();
  }
}
