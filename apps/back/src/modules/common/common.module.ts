import { Module } from '@nestjs/common';

import { CommonController } from './common.controller';
import { CommonService } from './common.service';

const services = [CommonService];

@Module({
  controllers: [CommonController],
  providers: [...services],
  exports: [...services],
})
export class CommonModule {}
