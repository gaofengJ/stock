import { Controller, Delete, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import * as dayjs from 'dayjs';

import { CommonDto } from '@/dto/common.dto';

import { DailyTaskService } from './daily-task.service';

@ApiTags('源数据 - 每日导入模块')
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @Post('/import')
  @ApiOperation({ summary: '导入当日数据' })
  async import(@Query('date') date: CommonDto['date']) {
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    this.dailyTaskService.import(formatedDate);
  }

  @Post('/bulk-import')
  @ApiOperation({ summary: '批量导入数据' })
  async bulkImport(
    @Query('startDate') startDate: CommonDto['startDate'],
    @Query('endDate') endDate: CommonDto['endDate'],
  ) {
    const formatedStartDate = dayjs(startDate).format('YYYY-MM-DD');
    const formatedEndDate = dayjs(endDate).format('YYYY-MM-DD');

    this.dailyTaskService.bulkImport(formatedStartDate, formatedEndDate);
  }

  @Delete('/delete')
  @ApiOperation({ summary: '删除当日数据' })
  async delete(@Query() dto: CommonDto) {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    this.dailyTaskService.delete(formatedDate);
  }
}
