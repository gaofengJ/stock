import { Injectable, OnApplicationBootstrap } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';
import { LoggerService } from '@/shared/logger/logger.service';
import { DailyTaskService } from '@/modules/daily-task/daily-task.service';
import { errorMessage } from '@/modules/daily-task/sync.utils';
import { getEnvConfigBoolean } from '@/utils';

/**
 * 定时任务-源数据导入
 */
@Injectable()
export class DailySourceTask implements OnApplicationBootstrap {
  constructor(
    private readonly logger: LoggerService,
    private dailyTaskService: DailyTaskService,
  ) {}

  onApplicationBootstrap() {
    // 不阻塞 HTTP 服务启动；停机期间缺失的交易日在后台补齐。
    if (
      getEnvConfigBoolean(
        'SYNC_ON_STARTUP',
        process.env.NODE_ENV === 'production',
      )
    ) {
      setImmediate(() => this.runSync());
    }
  }

  @Cron('0 30 20 * * *', {
    timeZone: 'Asia/Shanghai', // 指定时区为东八区
  })
  async handleCorn() {
    if (
      !getEnvConfigBoolean(
        'SYNC_SCHEDULE_ENABLED',
        process.env.NODE_ENV === 'production',
      )
    )
      return;
    await this.runSync();
  }

  private async runSync() {
    try {
      this.logger.log('源数据同步检查开始', DailySourceTask.name);
      await this.dailyTaskService.catchUp();
      this.logger.log('源数据同步检查结束', DailySourceTask.name);
    } catch (error) {
      this.logger.error(
        `源数据同步失败，下次检查重试: ${errorMessage(error)}`,
        DailySourceTask.name,
      );
    }
  }
}
