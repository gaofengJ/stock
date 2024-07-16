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

import * as dayjs from 'dayjs';
import { ApiResult } from '@/decorators/api-result.decorator';
import { IdParam } from '@/decorators/id-param.decorator';

import { Pagination } from '@/helper/paginate/pagination';
import { CommonDto } from '@/dto/common.dto';

import { TradeCalEntity } from './trade-cal.entity';

import {
  TradeCalDto,
  TradeCalQueryDto,
  TradeCalUpdateDto,
} from './trade-cal.dto';

import { TradeCalService } from './trade-cal.service';

@ApiTags('源数据 - TradeCal模块')
@Controller('trade-cal')
export class TradeCalController {
  constructor(private readonly tradeCalService: TradeCalService) {}

  @Get('/list')
  @ApiOperation({ summary: '获取TradeCal列表' })
  @ApiResult({ type: [TradeCalEntity], isPage: true })
  async list(
    @Query() dto: TradeCalQueryDto,
  ): Promise<Pagination<TradeCalEntity>> {
    return this.tradeCalService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取TradeCal详情' })
  @ApiResult({ type: TradeCalEntity })
  async info(@IdParam() id: number): Promise<TradeCalEntity> {
    return this.tradeCalService.detail(id);
  }

  @Post('/create')
  @ApiOperation({ summary: '创建TradeCal' })
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
  async update(@IdParam() id: number, @Body() dto: TradeCalUpdateDto) {
    await this.tradeCalService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除TradeCal' })
  async delete(@IdParam() id: number) {
    await this.tradeCalService.delete(id);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空TradeCal' })
  async clear() {
    await this.tradeCalService.clear();
  }

  @Get('/is-open')
  @ApiOperation({ summary: '查询当前日期是否为交易日' })
  @ApiResult({ type: Boolean })
  async isOpen(@Query() dto: CommonDto): Promise<boolean> {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    return this.tradeCalService.isOpen(formatedDate);
  }
}
