import { Module } from '@nestjs/common';

import { ChainsController } from './chains.controller';
import { ChainsService } from './chains.service';

const services = [ChainsService];

@Module({
  controllers: [ChainsController],
  providers: [...services],
  exports: [...services],
})
export class ChainsModule {}
