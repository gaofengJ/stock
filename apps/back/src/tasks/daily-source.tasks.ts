import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as dayjs from 'dayjs';

import { DailyTaskService } from '@/modules/daily-task/daily-task.service';
import { LoggerService } from '@/shared/logger/logger.service';

/**
 * 定时任务-源数据导入
 */
@Injectable()
export class DailySourceTask {
  constructor(
    private readonly logger: LoggerService,
    private dailyTaskService: DailyTaskService,
  ) {}

  @Cron('0 0 19 * * 1-5', {
    timeZone: 'Asia/Shanghai', // 指定时区为东八区
  })
  async handleCorn() {
    const date = dayjs().format('YYYY-MM-DD');
    this.logger.log(
      `定时任务-源数据导入开始，日期：${date}`,
      DailySourceTask.name,
    );
    await this.dailyTaskService.import(date);
    this.logger.log(
      `定时任务-源数据导入结束，日期：${date}`,
      DailySourceTask.name,
    );
  }
}
