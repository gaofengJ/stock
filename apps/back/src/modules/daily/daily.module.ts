import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyEntity } from './daily.entity';
import { DailyController } from './daily.controller';
import { DailyService } from './daily.service';

const services = [DailyService];

@Module({
  imports: [TypeOrmModule.forFeature([DailyEntity])],
  controllers: [DailyController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class DailyModule {}
