import { Injectable } from '@nestjs/common';

import { Cron } from '@nestjs/schedule';
import dayjs from 'dayjs';
import { LoggerService } from '@/shared/logger/logger.service';
import { Mission } from '../mission.decorator';

/**
 * Api接口请求类型任务
 */
@Injectable()
@Mission()
export class DailySourceJob {
  constructor(private readonly logger: LoggerService) {}

  @Cron('0 0 19 * * 1-5')
  async handleCorn() {
    const date = dayjs().format('YYYY-MM-DD');
    this.logger.log(`定时任务-源数据导入，日期：${date}`);
  }
}
