import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyTaskService } from './daily-task.service';
import { SyncSourceService } from './sync-source.service';
import { SyncRunEntity } from './sync-run.entity';

const services = [DailyTaskService];

@Module({
  imports: [TypeOrmModule.forFeature([SyncRunEntity])],
  controllers: [],
  providers: [...services, SyncSourceService],
  exports: [...services],
})
export class DailyTaskModule {}
