import {
  Body,
  Controller,
  Delete,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import * as dayjs from 'dayjs';

import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';

import { isDev } from '@/utils';
import { BizException } from '@/exceptions/biz.exception';
import { EError } from '@/constants';
import { TimeoutInterceptor } from '@/interceptors/timeout.interceptor';
import { DailyTaskService } from './daily-task.service';

@ApiTags('源数据 - 每日导入模块')
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @Post('/import')
  @UseInterceptors(new TimeoutInterceptor(1000 * 60))
  @ApiOperation({ summary: '导入当日数据' })
  async import(@Body('date') date: CommonDateDto['date']) {
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    await this.dailyTaskService.import(formatedDate);
  }

  @Post('/bulk-import')
  @UseInterceptors(new TimeoutInterceptor(1000 * 60 * 60 * 24))
  @ApiOperation({ summary: '批量导入数据' })
  async bulkImport(@Body() dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const formatedStartDate = dayjs(startDate).format('YYYY-MM-DD');
    const formatedEndDate = dayjs(endDate).format('YYYY-MM-DD');
    await this.dailyTaskService.bulkImport(formatedStartDate, formatedEndDate);
  }

  @Delete('/delete')
  @ApiOperation({ summary: '删除当日数据' })
  async delete(@Body('date') date: CommonDateDto['date']) {
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    await this.dailyTaskService.delete(formatedDate);
  }

  @Delete('/clear')
  @ApiOperation({ summary: '清空所有数据' })
  async clear() {
    if (!isDev) {
      throw new BizException(EError.CLEAR_NOT_ALLOWED);
    }
    await this.dailyTaskService.clear();
  }
}
