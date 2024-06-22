import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyTaskController } from './daily-task.controller';
import { DailyTaskService } from './daily-task.service';

const services = [DailyTaskService];

@Module({
  controllers: [DailyTaskController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class DailyTaskModule {}
