import { Controller, Delete, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import dayjs from 'dayjs';

import { CommonDto } from '@/dto/common.dto';

import { DailyTaskService } from './daily-task.service';

@ApiTags('源数据 - 每日导入模块')
@Controller('daily-task')
export class DailyTaskController {
  constructor(private readonly dailyTaskService: DailyTaskService) {}

  @Post('/import')
  @ApiOperation({ summary: '导入当日数据' })
  async import(@Query() dto: CommonDto) {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    this.dailyTaskService.import(formatedDate);
  }

  @Delete('/delete')
  @ApiOperation({ summary: '删除当日数据' })
  async delete(@Query() dto: CommonDto) {
    const { date } = dto;
    const formatedDate = dayjs(date).format('YYYY-MM-DD');
    this.dailyTaskService.delete(formatedDate);
  }
}
