import { Injectable } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';
import * as dayjs from 'dayjs';
import { LoggerService } from '@/shared/logger/logger.service';
import { DailyTaskService } from '@/modules/daily-task/daily-task.service';
import { AuthService } from '../modules/auth/auth.service';

/**
 * 定时任务-源数据导入
 */
@Injectable()
export class DailySourceTask {
  constructor(
    private auth: AuthService,
    private readonly logger: LoggerService,
    private dailyTaskService: DailyTaskService,
  ) {}

  @Cron('0 50 19 * * 1-5', {
    timeZone: 'Asia/Shanghai', // 指定时区为东八区
  })
  async handleCorn() {
    if (process.env.SCHEDULE_ENABLED === 'false') return;
    const date = dayjs().format('YYYY-MM-DD');
    this.logger.log(
      `定时任务-源数据导入开始，日期：${date}`,
      DailySourceTask.name,
    );
    await this.auth.audit(null, 'sync.scheduled', date, 'started');
    try {
      const complete = await this.dailyTaskService.import(date);
      await this.auth.audit(
        null,
        'sync.scheduled',
        date,
        complete ? 'success' : 'pending',
      );
    } catch (e) {
      await this.auth.audit(null, 'sync.scheduled', date, 'failed', {
        error: e.message,
      });
      throw e;
    }
    this.logger.log(
      `定时任务-源数据导入结束，日期：${date}`,
      DailySourceTask.name,
    );
  }
}
