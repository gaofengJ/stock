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
import { StockBasicEntity } from './stock-basic.entity';

import {
  StockBasicDto,
  StockBasicQueryDto,
  StockBasicUpdateDto,
} from './stock-basic.dto';
import { StockBasicService } from './stock-basic.service';

// export const permissions = definePermission('stockBasic', {
//   LIST: 'list',
//   CREATE: 'create',
//   READ: 'read',
//   UPDATE: 'update',
//   DELETE: 'delete',
// } as const);

@ApiTags('Business - TtockBasic模块')
// @UseGuards(ResourceGuard)
@Controller('stockBasics')
export class StockBasicController {
  constructor(private readonly stockBasicService: StockBasicService) {}

  @Get()
  @ApiOperation({ summary: '获取TtockBasic列表' })
  @ApiResult({ type: [StockBasicEntity] })
  // @Perm(permissions.LIST)
  async list(
    @Query() dto: StockBasicQueryDto,
  ): Promise<Pagination<StockBasicEntity>> {
    return this.stockBasicService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取TtockBasic详情' })
  @ApiResult({ type: StockBasicEntity })
  // @Perm(permissions.READ)
  async info(@IdParam() id: number): Promise<StockBasicEntity> {
    return this.stockBasicService.detail(id);
  }

  @Post()
  @ApiOperation({ summary: '创建TtockBasic' })
  // @Perm(permissions.CREATE)
  async create(@Body() dto: StockBasicDto): Promise<void> {
    await this.stockBasicService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新TtockBasic' })
  // @Perm(permissions.UPDATE)
  // @Resource(StockBasicEntity)
  async update(
    @IdParam() id: number,
    @Body() dto: StockBasicUpdateDto,
  ): Promise<void> {
    await this.stockBasicService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除TtockBasic' })
  // @Perm(permissions.DELETE)
  // @Resource(StockBasicEntity)
  async delete(@IdParam() id: number): Promise<void> {
    await this.stockBasicService.delete(id);
  }
}
