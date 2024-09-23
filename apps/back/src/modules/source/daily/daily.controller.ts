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
import { DailyDto, DailyQueryDto, DailyUpdateDto } from './daily.dto';
import { DailyEntity } from './daily.entity';
import { DailyService } from './daily.service';

// export const permissions = definePermission('Daily', {
//   LIST: 'list',
//   CREATE: 'create',
//   READ: 'read',
//   UPDATE: 'update',
//   DELETE: 'delete',
// } as const);

@ApiTags('源数据 - Daily模块')
// @UseGuards(ResourceGuard)
@Controller('daily')
export class DailyController {
  constructor(private readonly tradeCalService: DailyService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取Daily列表' })
  @ApiResult({ type: [DailyEntity], isPage: true })
  // @Perm(permissions.LIST)
  async list(@Query() dto: DailyQueryDto): Promise<Pagination<DailyEntity>> {
    return this.tradeCalService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取Daily详情' })
  @ApiResult({ type: DailyEntity })
  // @Perm(permissions.READ)
  async info(@IdParam() id: number): Promise<DailyEntity> {
    return this.tradeCalService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建Daily' })
  // @Perm(permissions.CREATE)
  async create(@Body() dto: DailyDto) {
    await this.tradeCalService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建Daily' })
  async bulkCreate(@Body() dto: DailyDto[]) {
    await this.tradeCalService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Daily' })
  // @Perm(permissions.UPDATE)
  // @Resource(DailyEntity)
  async update(@IdParam() id: number, @Body() dto: DailyUpdateDto) {
    await this.tradeCalService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Daily' })
  // @Perm(permissions.DELETE)
  // @Resource(DailyEntity)
  async delete(@IdParam() id: number) {
    await this.tradeCalService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空Daily' })
  async clear() {
    await this.tradeCalService.clear();
  }
}
