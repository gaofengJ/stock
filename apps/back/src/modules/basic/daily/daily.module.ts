import { Module } from '@nestjs/common';

import { DailyController } from './daily.controller';
import { DailyService } from './daily.service';

const services = [DailyService];

@Module({
  controllers: [DailyController],
  providers: [...services],
  exports: [...services],
})
export class DailyModule {}
