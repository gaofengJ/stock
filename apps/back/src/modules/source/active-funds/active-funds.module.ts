import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ActiveFundsController } from './active-funds.controller';
import { ActiveFundsEntity } from './active-funds.entity';
import { ActiveFundsService } from './active-funds.service';

const services = [ActiveFundsService];

@Module({
  imports: [TypeOrmModule.forFeature([ActiveFundsEntity])],
  controllers: [ActiveFundsController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class ActiveFundsModule {}
