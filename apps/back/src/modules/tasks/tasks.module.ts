import { DynamicModule, ExistingProvider, Module } from '@nestjs/common';

import { DailySourceJob } from './jobs/daily-source.job';

// 定时任务提供者数组
const providers = [DailySourceJob];

/**
 * 创建别名提供者
 * 用于为每个定时任务提供者创建一个别名，使得可以通过字符串类型获取定义的服务
 * @returns 别名提供者
 */
const createAliasProviders = (): ExistingProvider[] => {
  const aliasProviders: ExistingProvider[] = [];
  for (let i = 0; i < providers.length; i += 1) {
    aliasProviders.push({
      provide: providers[i].name,
      useExisting: providers[i],
    });
  }
  return aliasProviders;
};

/**
 * 所有需要执行的定时任务都需要在这里注册
 */
@Module({})
export class TasksModule {
  /**
   * 创建动态模块对象，用于注册定时任务相关的提供者
   * @returns 返回动态模块对象
   */
  static forRoot(): DynamicModule {
    // 使用别名提供者定义别名，以便通过字符串类型获取定义的服务
    const aliasProviders = createAliasProviders();
    return {
      global: true, // 设置模块为全局模块
      module: TasksModule, // 设置模块为当前类
      providers: [...providers, ...aliasProviders], // 注册提供者，包括定时任务提供者和别名提供者
      exports: aliasProviders, // 导出别名提供者，使得其他模块可以使用这些提供者的别名来获取对应的服务
    };
  }
}
