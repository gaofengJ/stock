import { Global, Module } from '@nestjs/common';
import { DailyTaskModule } from '../daily-task/daily-task.module';
import { AdminController } from './admin.controller';
import { DataLockService } from './data-lock.service';
import { JobsService } from './jobs.service';
import { LogsService } from './logs.service';
import { PlaybookController } from './playbook/playbook.controller';

@Global()
@Module({
  imports: [DailyTaskModule],
  controllers: [AdminController, PlaybookController],
  providers: [DataLockService, JobsService, LogsService],
  exports: [DataLockService],
})
export class AdminModule {}
