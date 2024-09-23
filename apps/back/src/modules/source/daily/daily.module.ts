import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DailyController } from './daily.controller';
import { DailyEntity } from './daily.entity';
import { DailyService } from './daily.service';

const services = [DailyService];

@Module({
  imports: [TypeOrmModule.forFeature([DailyEntity])],
  controllers: [DailyController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class DailyModule {}
