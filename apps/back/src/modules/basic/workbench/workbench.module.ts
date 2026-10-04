import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BasicSnapshotEntity } from './snapshot.entity';
import { BasicSnapshotService } from './snapshot.service';
import { WorkbenchService } from './workbench.service';
import { WorkbenchController } from './workbench.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BasicSnapshotEntity])],
  controllers: [WorkbenchController],
  providers: [BasicSnapshotService, WorkbenchService],
  exports: [BasicSnapshotService, WorkbenchService],
})
export class WorkbenchModule {}
