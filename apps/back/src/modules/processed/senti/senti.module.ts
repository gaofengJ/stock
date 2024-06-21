import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SentiEntity } from './senti.entity';
import { SentiController } from './senti.controller';
import { SentiService } from './senti.service';

const services = [SentiService];

@Module({
  imports: [TypeOrmModule.forFeature([SentiEntity])],
  controllers: [SentiController],
  providers: [...services],
  exports: [TypeOrmModule, ...services],
})
export class SentiModule {}
