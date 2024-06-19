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
import { SentiEntity } from './senti.entity';

import { SentiDto, SentiQueryDto, SentiUpdateDto } from './senti.dto';
import { SentiService } from './senti.service';

// export const permissions = definePermission('Senti', {
//   LIST: 'list',
//   CREATE: 'create',
//   READ: 'read',
//   UPDATE: 'update',
//   DELETE: 'delete',
// } as const);

@ApiTags('源数据 - Senti模块')
// @UseGuards(ResourceGuard)
@Controller('senti')
export class SentiController {
  constructor(private readonly tradeCalService: SentiService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取Senti列表' })
  @ApiResult({ type: [SentiEntity], isPage: true })
  // @Perm(permissions.LIST)
  async list(@Query() dto: SentiQueryDto): Promise<Pagination<SentiEntity>> {
    return this.tradeCalService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取Senti详情' })
  @ApiResult({ type: SentiEntity })
  // @Perm(permissions.READ)
  async info(@IdParam() id: number): Promise<SentiEntity> {
    return this.tradeCalService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建Senti' })
  // @Perm(permissions.CREATE)
  async create(@Body() dto: SentiDto) {
    await this.tradeCalService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建Senti' })
  async bulkCreate(@Body() dto: SentiDto[]) {
    await this.tradeCalService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Senti' })
  // @Perm(permissions.UPDATE)
  // @Resource(SentiEntity)
  async update(@IdParam() id: number, @Body() dto: SentiUpdateDto) {
    await this.tradeCalService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Senti' })
  // @Perm(permissions.DELETE)
  // @Resource(SentiEntity)
  async delete(@IdParam() id: number) {
    await this.tradeCalService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空Senti' })
  async clear() {
    await this.tradeCalService.clear();
  }
}
