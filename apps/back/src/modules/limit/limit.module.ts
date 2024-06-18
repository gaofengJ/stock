import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LimitEntity } from './limit.entity';
import { LimitController } from './limit.controller';
import { LimitService } from './limit.service';

const services = [LimitService];

@Module({
  imports: [TypeOrmModule.forFeature([LimitEntity])],
  controllers: [LimitController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class LimitModule {}
