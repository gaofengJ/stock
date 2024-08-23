import { Module } from '@nestjs/common';

import { ActiveFundsController } from './active-funds.controller';
import { ActiveFundsService } from './active-funds.service';

const services = [ActiveFundsService];

@Module({
  controllers: [ActiveFundsController],
  providers: [...services],
  exports: [...services],
})
export class ActiveFundsModule {}
