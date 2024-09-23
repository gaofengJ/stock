import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TradeCalController } from './trade-cal.controller';
import { TradeCalEntity } from './trade-cal.entity';
import { TradeCalService } from './trade-cal.service';

const services = [TradeCalService];

@Module({
  imports: [TypeOrmModule.forFeature([TradeCalEntity])],
  controllers: [TradeCalController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class TradeCalModule {}
