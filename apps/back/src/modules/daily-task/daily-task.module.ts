import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyTaskController } from './daily-task.controller';
import { DailyTaskService } from './daily-task.service';
import { SyncSourceService } from './sync-source.service';
import { SyncRunEntity } from './sync-run.entity';

const services = [DailyTaskService];

@Module({
  imports: [TypeOrmModule.forFeature([SyncRunEntity])],
  controllers: [DailyTaskController],
  providers: [...services, SyncSourceService],
  exports: [...services],
})
export class DailyTaskModule {}
