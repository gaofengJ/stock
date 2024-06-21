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
import { StockEntity } from './stock.entity';

import { StockDto, StockQueryDto, StockUpdateDto } from './stock.dto';
import { StockService } from './stock.service';

// export const permissions = definePermission('stockBasic', {
//   LIST: 'list',
//   CREATE: 'create',
//   READ: 'read',
//   UPDATE: 'update',
//   DELETE: 'delete',
// } as const);

@ApiTags('源数据 - Stock模块')
// @UseGuards(ResourceGuard)
@Controller('stock')
export class StockController {
  constructor(private readonly stockBasicService: StockService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取Stock列表' })
  @ApiResult({ type: [StockEntity], isPage: true })
  // @Perm(permissions.LIST)
  async list(@Query() dto: StockQueryDto): Promise<Pagination<StockEntity>> {
    return this.stockBasicService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取Stock详情' })
  @ApiResult({ type: StockEntity })
  // @Perm(permissions.READ)
  async info(@IdParam() id: number): Promise<StockEntity> {
    return this.stockBasicService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建Stock' })
  // @Perm(permissions.CREATE)
  async create(@Body() dto: StockDto) {
    await this.stockBasicService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建Stock' })
  async bulkCreate(@Body() dto: StockDto[]) {
    await this.stockBasicService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新Stock' })
  // @Perm(permissions.UPDATE)
  // @Resource(StockEntity)
  async update(@IdParam() id: number, @Body() dto: StockUpdateDto) {
    await this.stockBasicService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除Stock' })
  // @Perm(permissions.DELETE)
  // @Resource(StockEntity)
  async delete(@IdParam() id: number) {
    await this.stockBasicService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空Stock' })
  async clear() {
    await this.stockBasicService.clear();
  }
}
