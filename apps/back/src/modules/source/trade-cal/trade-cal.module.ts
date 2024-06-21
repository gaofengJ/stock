import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TradeCalEntity } from './trade-cal.entity';
import { TradeCalController } from './trade-cal.controller';
import { TradeCalService } from './trade-cal.service';

const services = [TradeCalService];

@Module({
  imports: [TypeOrmModule.forFeature([TradeCalEntity])],
  controllers: [TradeCalController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class TradeCalModule {}
