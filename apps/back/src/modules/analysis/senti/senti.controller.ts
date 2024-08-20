import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import * as dayjs from 'dayjs';

import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';

import { SentiService } from './senti.service';

@ApiTags('数据分析')
@Controller('senti')
export class SentiController {
  constructor(private readonly sentiService: SentiService) {}

  @Get('/distribution-tatistics')
  @ApiOperation({ summary: '涨跌分布统计' })
  async distributionTatistics(@Query() dto: CommonDateDto) {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    const ret = await this.sentiService.distributionTatistics(formatedDate);
    return ret;
  }

  @Get('/limit-up-down-tatistics')
  @ApiOperation({ summary: '涨跌停统计' })
  async limitUpDownTatistics(@Query() dto: CommonDateRangeDto) {
    const ret = await this.sentiService.limitUpDownTatistics(dto);
    return ret;
  }

  @Get('/up-count')
  @ApiOperation({ summary: '查询上涨家数' })
  async upCount(@Query() dto: CommonDateRangeDto) {
    const ret = await this.sentiService.upCount(dto);
    return ret;
  }

  @Get('/list')
  @ApiOperation({ summary: '查询短线情绪' })
  async list(dto: CommonDateRangeDto) {
    const ret = await this.sentiService.list(dto);
    return ret;
  }
}
