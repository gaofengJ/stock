import { Module } from '@nestjs/common';

import { TradeCalController } from './trade-cal.controller';
import { TradeCalService } from './trade-cal.service';

const services = [TradeCalService];

@Module({
  controllers: [TradeCalController],
  providers: [...services],
  exports: [...services],
})
export class TradeCalModule {}
