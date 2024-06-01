import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import config from './configs';

import { SharedModule } from './shared/shared.module';

import { BasicModule } from './modules/basic/basic.module';
import { LimitModule } from './modules/limit/limit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 允许环境变量中的其他环境变量进行展开
      expandVariables: true,
      // 指定多个 env 文件时，第一个优先级最高
      envFilePath: ['.env.local', `.env.${process.env.NODE_ENV}`, '.env'],
      load: [...Object.values(config)],
    }),
    // 避免暴力请求，限制同一个接口 10 秒内不能超过 7 次请求
    // ThrottlerModule.forRootAsync({
    //   useFactory: () => ({
    //     errorMessage: '当前操作过于频繁，请稍后再试！',
    //     throttlers: [{ ttl: seconds(10), limit: 7 }],
    //   }),
    // }),
    SharedModule,

    BasicModule,
    LimitModule,
  ],
  providers: [],
})
export class AppModule {}
