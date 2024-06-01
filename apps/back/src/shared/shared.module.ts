import { Global, Module } from '@nestjs/common';

import { LoggerModule } from './logger/logger.module';

@Global()
@Module({
  imports: [
    // logger
    LoggerModule.forRoot(),
    // // http
    // HttpModule,
    // // schedule
    // ScheduleModule.forRoot(),
    // // rate limit
    // ThrottlerModule.forRoot([
    //   {
    //     limit: 3,
    //     ttl: 60000,
    //   },
    // ]),
    // EventEmitterModule.forRoot({
    //   wildcard: true,
    //   delimiter: '.',
    //   newListener: false,
    //   removeListener: false,
    //   maxListeners: 20,
    //   verboseMemoryLeak: isDev,
    //   ignoreErrors: false,
    // }),
    // // redis
    // RedisModule,
    // // mailer
    // MailerModule,
    // // helper
    // HelperModule,
  ],
  // exports: [HttpModule, MailerModule, RedisModule, HelperModule],
})
export class SharedModule {}
