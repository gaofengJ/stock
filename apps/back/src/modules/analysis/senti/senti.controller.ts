import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import * as dayjs from 'dayjs';
import { ApiResult } from '@/decorators/api-result.decorator';

import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';
import { SentiEntity } from '@/modules/processed/senti/senti.entity';

import { SentiService } from './senti.service';
import {
  SentiDistributionTatisticsEntity,
  SentiLimitUpDownCountEntity,
  SentiLimitUpMaxTimesCountEntity,
  SentiUpDownCountEntity,
} from './senti.entity';

@ApiTags('数据分析')
@Controller('senti')
export class SentiController {
  constructor(private readonly sentiService: SentiService) {}

  @Get('/distribution-tatistics')
  @ApiOperation({ summary: '涨跌分布统计' })
  @ApiResult({ type: [SentiDistributionTatisticsEntity], isPage: false })
  async distributionTatistics(@Query() dto: CommonDateDto) {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    const ret = await this.sentiService.distributionTatistics(formatedDate);
    return ret;
  }

  @Get('/up-down-count')
  @ApiOperation({ summary: '连日涨跌统计' })
  @ApiResult({ type: [SentiUpDownCountEntity], isPage: false })
  async upDownCount(@Query() dto: CommonDateRangeDto) {
    const ret = await this.sentiService.upDownCount(dto);
    return ret;
  }

  @Get('/limit-up-down-count')
  @ApiOperation({ summary: '连日涨跌停统计' })
  @ApiResult({ type: [SentiLimitUpDownCountEntity], isPage: false })
  async limitUpDownCount(@Query() dto: CommonDateRangeDto) {
    const ret = await this.sentiService.limitUpDownCount(dto);
    return ret;
  }

  @Get('/limit-up-max-times-count')
  @ApiOperation({ summary: '连日涨停板高度统计' })
  @ApiResult({ type: [SentiLimitUpMaxTimesCountEntity], isPage: false })
  async limitUpMaxTimesCount(@Query() dto: CommonDateRangeDto) {
    const ret = await this.sentiService.limitUpMaxTimesCount(dto);
    return ret;
  }

  @Get('/list')
  @ApiOperation({ summary: '查询短线情绪' })
  @ApiResult({ type: [SentiEntity], isPage: false })
  async list(dto: CommonDateRangeDto) {
    const ret = await this.sentiService.list(dto);
    return ret;
  }
}
