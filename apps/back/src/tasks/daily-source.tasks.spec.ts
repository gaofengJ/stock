import { DailyTaskService } from '@/modules/daily-task/daily-task.service';
import { LoggerService } from '@/shared/logger/logger.service';
import { DailySourceTask } from './daily-source.tasks';

describe('同步任务环境隔离', () => {
  const original = { ...process.env };
  const catchUp = jest.fn().mockResolvedValue(undefined);
  const task = new DailySourceTask(
    { log: jest.fn(), error: jest.fn() } as unknown as LoggerService,
    { catchUp } as unknown as DailyTaskService,
  );
  beforeEach(() => {
    catchUp.mockClear();
    delete process.env.SYNC_ON_STARTUP;
    delete process.env.SYNC_SCHEDULE_ENABLED;
  });
  afterEach(() => {
    process.env = { ...original };
  });
  it('开发模式默认不自动读写数据', async () => {
    process.env.NODE_ENV = 'development';
    task.onApplicationBootstrap();
    await task.handleCorn();
    await new Promise(setImmediate);
    expect(catchUp).not.toHaveBeenCalled();
  });
  it('生产模式可独立禁用定时任务而启用启动补同步', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SYNC_SCHEDULE_ENABLED = 'false';
    process.env.SYNC_ON_STARTUP = 'true';
    await task.handleCorn();
    expect(catchUp).not.toHaveBeenCalled();
    task.onApplicationBootstrap();
    await new Promise(setImmediate);
    expect(catchUp).toHaveBeenCalledTimes(1);
  });
  it('生产模式默认保留定时同步', async () => {
    process.env.NODE_ENV = 'production';
    await task.handleCorn();
    expect(catchUp).toHaveBeenCalledTimes(1);
  });
  it('生产默认关闭启动同步，四个补试时点继续受开关控制', async () => {
    process.env.NODE_ENV = 'production';
    task.onApplicationBootstrap();
    await new Promise(setImmediate);
    expect(catchUp).not.toHaveBeenCalled();
    await task.handleRetry();
    await task.handleLateRetry();
    expect(catchUp).toHaveBeenCalledTimes(2);
    expect(catchUp.mock.calls[0][1]).toBe(true);
    process.env.SYNC_SCHEDULE_ENABLED = 'false';
    await task.handleRetry();
    await task.handleLateRetry();
    expect(catchUp).toHaveBeenCalledTimes(2);
  });
});
