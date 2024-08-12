import { Module } from '@nestjs/common';

import { LimitsController } from './limits.controller';
import { LimitsService } from './limits.service';

const services = [LimitsService];

@Module({
  controllers: [LimitsController],
  providers: [...services],
  exports: [...services],
})
export class LimitsModule {}
