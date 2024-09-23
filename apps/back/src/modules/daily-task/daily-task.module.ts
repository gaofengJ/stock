import { Module } from '@nestjs/common';

import { DailyTaskController } from './daily-task.controller';
import { DailyTaskService } from './daily-task.service';

const services = [DailyTaskService];

@Module({
  controllers: [DailyTaskController],
  providers: [...services],
  exports: [...services],
})
export class DailyTaskModule {}
