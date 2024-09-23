import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiResult } from '@/decorators/api-result.decorator';
import { IdParam } from '@/decorators/id-param.decorator';

import { ActiveFundsDto, ActiveFundsUpdateDto } from './active-funds.dto';
import { ActiveFundsEntity } from './active-funds.entity';
import { ActiveFundsService } from './active-funds.service';

@ApiTags('源数据 - ActiveFunds模块')
@Controller('active-funds')
export class ActiveFundsController {
  constructor(private readonly activeFundsService: ActiveFundsService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取ActiveFunds列表' })
  @ApiResult({ type: [ActiveFundsEntity], isPage: true })
  async list(): Promise<ActiveFundsEntity[]> {
    const ret = await this.activeFundsService.list();
    return ret;
  }

  @Get(':id')
  @ApiOperation({ summary: '获取ActiveFunds详情' })
  @ApiResult({ type: ActiveFundsEntity })
  async info(@IdParam() id: number): Promise<ActiveFundsEntity> {
    return this.activeFundsService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建ActiveFunds' })
  async create(@Body() dto: ActiveFundsDto) {
    await this.activeFundsService.create(dto);
  }

  @Post('/bulk-create')
  @ApiOperation({ summary: '批量创建ActiveFunds' })
  async bulkCreate(@Body() dto: ActiveFundsDto[]) {
    await this.activeFundsService.bulkCreate(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: '更新ActiveFunds' })
  async update(@IdParam() id: number, @Body() dto: ActiveFundsUpdateDto) {
    await this.activeFundsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除ActiveFunds' })
  async delete(@IdParam() id: number) {
    await this.activeFundsService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空ActiveFunds' })
  async clear() {
    await this.activeFundsService.clear();
  }
}
