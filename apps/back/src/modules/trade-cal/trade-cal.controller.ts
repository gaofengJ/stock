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
import { TradeCalEntity } from './trade-cal.entity';

import {
  TradeCalDto,
  TradeCalQueryDto,
  TradeCalUpdateDto,
} from './trade-cal.dto';
import { TradeCalService } from './trade-cal.service';

// export const permissions = definePermission('TradeCal', {
//   LIST: 'list',
//   CREATE: 'create',
//   READ: 'read',
//   UPDATE: 'update',
//   DELETE: 'delete',
// } as const);

@ApiTags('源数据 - TradeCal模块')
// @UseGuards(ResourceGuard)
@Controller('trade-cal')
export class TradeCalController {
  constructor(private readonly tradeCalService: TradeCalService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取TradeCal列表' })
  @ApiResult({ type: [TradeCalEntity], isPage: true })
  // @Perm(permissions.LIST)
  async list(
    @Query() dto: TradeCalQueryDto,
  ): Promise<Pagination<TradeCalEntity>> {
    return this.tradeCalService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取TradeCal详情' })
  @ApiResult({ type: TradeCalEntity })
  // @Perm(permissions.READ)
  async info(@IdParam() id: number): Promise<TradeCalEntity> {
    return this.tradeCalService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建TradeCal' })
  // @Perm(permissions.CREATE)
  async create(@Body() dto: TradeCalDto) {
    await this.tradeCalService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建TradeCal' })
  async bulkCreate(@Body() dto: TradeCalDto[]) {
    await this.tradeCalService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新TradeCal' })
  // @Perm(permissions.UPDATE)
  // @Resource(TradeCalEntity)
  async update(@IdParam() id: number, @Body() dto: TradeCalUpdateDto) {
    await this.tradeCalService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除TradeCal' })
  // @Perm(permissions.DELETE)
  // @Resource(TradeCalEntity)
  async delete(@IdParam() id: number) {
    await this.tradeCalService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空TradeCal' })
  async clear() {
    await this.tradeCalService.clear();
  }
}
