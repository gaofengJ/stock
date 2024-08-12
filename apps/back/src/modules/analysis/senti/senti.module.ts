import { Module } from '@nestjs/common';

import { SentiController } from './senti.controller';
import { SentiService } from './senti.service';

const services = [SentiService];

@Module({
  controllers: [SentiController],
  providers: [...services],
  exports: [...services],
})
export class SentiModule {}
