import { Global, Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
// import { ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { isDev } from '@/utils';
import { LoggerModule } from './logger/logger.module';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot(), // logger
    HttpModule, // http
    ScheduleModule.forRoot(), // schedule
    // rate limit
    // ThrottlerModule.forRoot([
    //   {
    //     limit: 100,
    //     ttl: 60000,
    //   },
    // ]),
    EventEmitterModule.forRoot({
      wildcard: true, // 允许使用通配符来匹配事件名称
      delimiter: '.', // 定义了用于分隔事件名称中的不同部分的字符
      newListener: false, // 定义了当新的事件监听器被添加时是否发出一个特殊事件
      removeListener: false, // 定义了当事件监听器被移除时是否发出一个特殊事件
      maxListeners: 20, // 定义了单个事件允许拥有的最大监听器数量
      verboseMemoryLeak: isDev, // 定义了是否在事件监听器超过最大数量时输出内存泄漏警告
      ignoreErrors: false, // 定义了是否在事件监听器超过最大数量时输出内存泄漏警告
    }),
    // RedisModule, // redis
    // HelperModule, // helper
  ],
  // exports: [HttpModule, MailerModule, RedisModule, HelperModule],
})
export class SharedModule {}
