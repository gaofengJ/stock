import { Module } from '@nestjs/common';

import { WorkbenchModule } from '../basic/workbench/workbench.module';
import { CandidateFinancialService } from './candidate-financial.service';
import { CandidateRiskService } from './candidate-risk.service';
import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyCacheService } from './strategy-cache.service';
import { StrategyReadService } from './strategy-read.service';

const services = [
  StrategyService,
  StrategyCacheService,
  StrategyReadService,
  CandidateFinancialService,
  CandidateRiskService,
];

@Module({
  imports: [WorkbenchModule],
  controllers: [StrategyController],
  providers: [...services],
  exports: [...services],
})
export class StrategyModule {}
