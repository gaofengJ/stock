import { Module } from '@nestjs/common';

import { BasicController } from './basic.controller';
import { BasicService } from './basic.service';

const services = [BasicService];

@Module({
  controllers: [BasicController],
  providers: [...services],
  exports: [...services],
})
export class BasicModule {}
