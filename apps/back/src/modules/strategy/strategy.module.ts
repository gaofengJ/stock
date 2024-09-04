import { Module } from '@nestjs/common';

import { StrategyController } from './strategy.controller';
import { StrategyService } from './strategy.service';

const services = [StrategyService];

@Module({
  controllers: [StrategyController],
  providers: [...services],
  exports: [...services],
})
export class StrategyModule {}
