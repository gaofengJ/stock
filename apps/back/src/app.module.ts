import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BasicModule } from './basic/basic.module';
import { LimitModule } from './limit/limit.module';

@Module({
  imports: [BasicModule, LimitModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
