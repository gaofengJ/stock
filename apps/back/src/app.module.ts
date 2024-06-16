import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import config from '@/configs';
import { SharedModule } from '@/shared/shared.module';
import { TasksModule } from '@/modules/tasks/tasks.module';
import { StockBasicModule } from '@/modules/stock-basic/stock-basic.module';
import { LimitModule } from '@/modules/limit/limit.module';
import { DatabaseModule } from '@/shared/database/database.module';
import { AllExceptionsFilter } from '@/filters/exceptions.filter';
import { TransformInterceptor } from '@/interceptors/transform.interceptor';
import { TimeoutInterceptor } from '@/interceptors/timeout.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // 允许环境变量中的其他环境变量进行展开
      expandVariables: true,
      // 指定多个 env 文件时，第一个优先级最高
      envFilePath: [`.env.${process.env.NODE_ENV}`, '.env'],
      load: [...Object.values(config)],
    }),
    // 避免暴力请求，限制同一个接口 10 秒内不能超过 7 次请求
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        errorMessage: '当前操作过于频繁，请稍后再试！',
        throttlers: [{ ttl: seconds(10), limit: 7 }],
      }),
    }),
    TasksModule.forRoot(),

    SharedModule,
    DatabaseModule,

    StockBasicModule,
    LimitModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter }, // 自定义异常过滤器，用于捕获和处理应用程序中所有未被捕获的异常，统一异常处理逻辑

    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor }, // 自动序列化类实例，确保返回的响应对象符合预期的格式
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor }, // 自定义拦截器，用于在请求和响应过程中进行数据转换
    {
      provide: APP_INTERCEPTOR,
      useFactory: () => new TimeoutInterceptor(15 * 1000), // 自定义拦截器，用于设置请求的超时时间。这里通过 useFactory 动态生成一个超时时间为 15 秒的拦截器
    },
    // { provide: APP_INTERCEPTOR, useClass: IdempotenceInterceptor }, // 自定义拦截器，用于确保请求的幂等性，防止重复处理相同的请求

    // { provide: APP_GUARD, useClass: JwtAuthGuard },
    // { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
