import { Module } from '@nestjs/common';

import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';
import { StrategyCacheService } from './strategy-cache.service';

const services = [StrategyService, StrategyCacheService];

@Module({
  controllers: [StrategyController],
  providers: [...services],
  exports: [...services],
})
export class StrategyModule {}
