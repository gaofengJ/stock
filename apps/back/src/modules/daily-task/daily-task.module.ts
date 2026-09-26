import { Module } from '@nestjs/common';

import { DailyTaskService } from './daily-task.service';

const services = [DailyTaskService];

@Module({
  controllers: [],
  providers: [...services],
  exports: [...services],
})
export class DailyTaskModule {}
