import { Module } from '@nestjs/common';

import { AnalysisController } from './analysis.controller';
import { AnalysisService } from './analysis.service';

const services = [AnalysisService];

@Module({
  controllers: [AnalysisController],
  providers: [...services],
  exports: [...services],
})
export class AnalysisModule {}
