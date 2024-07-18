import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import * as dayjs from 'dayjs';

import { CommonDateDto, CommonDateRangeDto } from '@/dto/common.dto';

import { DailyTaskService } from './daily-task.service';

@ApiTags('源数据 - 每日导入模块')
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @Post('/import')
  @ApiOperation({ summary: '导入当日数据' })
  async import(@Body('date') date: CommonDateDto['date']) {
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    this.dailyTaskService.import(formatedDate);
  }

  @Post('/bulk-import')
  @ApiOperation({ summary: '批量导入数据' })
  async bulkImport(@Body() dto: CommonDateRangeDto) {
    const { startDate, endDate } = dto;
    const formatedStartDate = dayjs(startDate).format('YYYY-MM-DD');
    const formatedEndDate = dayjs(endDate).format('YYYY-MM-DD');

    this.dailyTaskService.bulkImport(formatedStartDate, formatedEndDate);
  }

  @Delete('/delete')
  @ApiOperation({ summary: '删除当日数据' })
  async delete(@Body('date') date: CommonDateDto['date']) {
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    this.dailyTaskService.delete(formatedDate);
  }
}
