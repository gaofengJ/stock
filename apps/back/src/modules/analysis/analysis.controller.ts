import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import dayjs from 'dayjs';

import { CommonDto } from '@/dto/common.dto';

import { AnalysisService } from './analysis.service';

@ApiTags('数据分析')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get('/statistics')
  @ApiOperation({ summary: '涨跌分布统计' })
  async statistics(@Query() dto: CommonDto) {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    const ret = await this.analysisService.statistics(formatedDate);
    return ret;
  }

  @Get('/limits')
  @ApiOperation({ summary: '涨跌停统计' })
  async limits(@Query() dto: CommonDto) {
    const { startDate, endDate } = dto;
    const formatedStartDate = dayjs(startDate).format('YYYY-MM-DD');
    const formatedEndDate = dayjs(endDate).format('YYYY-MM-DD');

    const ret = await this.analysisService.limits({
      startDate: formatedStartDate,
      endDate: formatedEndDate,
    });
    return ret;
  }
}
