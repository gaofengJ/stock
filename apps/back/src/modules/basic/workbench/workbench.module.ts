import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BasicSnapshotEntity } from './snapshot.entity';
import { BasicSnapshotService } from './snapshot.service';
import { WorkbenchService } from './workbench.service';
import { WorkbenchController } from './workbench.controller';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchSourceService } from './research-source.service';

@Module({
  imports: [TypeOrmModule.forFeature([BasicSnapshotEntity])],
  controllers: [WorkbenchController, ResearchController],
  providers: [
    BasicSnapshotService,
    WorkbenchService,
    ResearchService,
    ResearchSourceService,
  ],
  exports: [BasicSnapshotService, WorkbenchService],
})
export class WorkbenchModule {}
