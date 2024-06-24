import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

const services = [AnalysisService];

@Module({
  controllers: [AnalysisController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class AnalysisModule {}
