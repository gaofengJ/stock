import { ClassSerializerInterceptor, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';

import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { FastifyRequest } from 'fastify';
import { ScheduleModule } from '@nestjs/schedule';
import config from '@/configs';

import { SharedModule } from '@/shared/shared.module';

import { DatabaseModule } from '@/shared/database/database.module';

import { AllExceptionsFilter } from '@/filters/exceptions.filter';
import { TransformInterceptor } from '@/interceptors/transform.interceptor';
import { TimeoutInterceptor } from '@/interceptors/timeout.interceptor';

import { SourceModule } from '@/modules/source/source.module';
import { ProcessedModule } from '@/modules/processed/processed.module';
import { DailyTaskModule } from '@/modules/daily-task/daily-task.module';
import { AnalysisModule } from '@/modules/analysis/analysis.module';
import { StrategyModule } from '@/modules/strategy/strategy.module';
import { BasicModule } from '@/modules/basic/basic.module';
import { CommonModule } from '@/modules/common/common.module';
import { DailySourceTask } from '@/tasks/daily-source.tasks';

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
    // 启用 CLS 上下文
    ClsModule.forRoot({
      global: true,
      interceptor: {
        mount: true,
        setup: (cls, context) => {
          const req = context
            .switchToHttp()
            .getRequest<FastifyRequest<{ Params: { id?: string } }>>();
          if (req.params?.id && req.body) {
            // 供自定义参数验证器(UniqueConstraint)使用
            cls.set('operateId', Number.parseInt(req.params.id, 10));
          }
        },
      },
    }),
    SharedModule,
    DatabaseModule,

    ScheduleModule.forRoot(),

    /**
     * 源数据模块
     */
    SourceModule.forRoot(),
    /**
     * 二次处理数据模块
     */
    ProcessedModule.forRoot(),
    /**
     * 每日任务模块
     */
    DailyTaskModule,
    /**
     * 公共模块
     */
    CommonModule,
    /**
     * 数据分析模块
     */
    AnalysisModule,
    /**
     * 策略选股
     */
    StrategyModule,
    /**
     * 基础数据模块
     */
    BasicModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter }, // 自定义异常过滤器，用于捕获和处理应用程序中所有未被捕获的异常，统一异常处理逻辑

    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor }, // 自动序列化类实例，确保返回的响应对象符合预期的格式
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor }, // 自定义拦截器，用于在请求和响应过程中进行数据转换
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor, // 自定义拦截器，用于设置请求的超时时间
    },
    // { provide: APP_INTERCEPTOR, useClass: IdempotenceInterceptor }, // 自定义拦截器，用于确保请求的幂等性，防止重复处理相同的请求

    // { provide: APP_GUARD, useClass: JwtAuthGuard },
    // { provide: APP_GUARD, useClass: RbacGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    DailySourceTask, // 定时任务
  ],
})
export class AppModule {}
