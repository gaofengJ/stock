import 'reflect-metadata';
import { ExecutionContext, RequestTimeoutException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { firstValueFrom, NEVER, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { QUERY_TIMEOUT_MS } from '@/decorators/query-timeout.decorator';
import { NO_TIMEOUT_INTERCEPTOR_KEY } from '@/decorators/no-timeout.decorator';
import { StrategyController } from '@/modules/strategy/strategy.controller';
import { MarketController } from '@/modules/analysis/market/market.controller';
import { TimeoutInterceptor } from './timeout.interceptor';

describe('查询等待上限', () => {
  test('只有策略列表及策略联动使用60秒上限', () => {
    [
      StrategyController.prototype.list,
      MarketController.prototype.signals,
      MarketController.prototype.sectorSignals,
    ].forEach((handler) => {
      expect(Reflect.getMetadata(QUERY_TIMEOUT_MS, handler)).toBe(60000);
    });
    expect(
      Reflect.getMetadata(
        QUERY_TIMEOUT_MS,
        StrategyController.prototype.tabsList,
      ),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(QUERY_TIMEOUT_MS, MarketController.prototype.status),
    ).toBeUndefined();
  });
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const context = { getHandler: () => () => {} } as unknown as ExecutionContext;
  function interceptor(milliseconds?: number, disabled = false) {
    return new TimeoutInterceptor({
      get: (key: string) => {
        if (key === QUERY_TIMEOUT_MS) return milliseconds;
        if (key === NO_TIMEOUT_INTERCEPTOR_KEY) return disabled;
        return undefined;
      },
    } as unknown as Reflector);
  }
  test('普通接口仍在15秒结束等待', async () => {
    const result = firstValueFrom(
      interceptor().intercept(context, { handle: () => NEVER }),
    ).catch((error) => error);
    await jest.advanceTimersByTimeAsync(15000);
    expect(await result).toBeInstanceOf(RequestTimeoutException);
  });
  test('60秒查询允许20秒计算，仍有明确的等待上限', async () => {
    const query = interceptor(60000);
    const result = firstValueFrom(
      query.intercept(context, {
        handle: () => of('ready').pipe(delay(20000)),
      }),
    );
    await jest.advanceTimersByTimeAsync(20000);
    expect(await result).toBe('ready');
    const expired = firstValueFrom(
      query.intercept(context, { handle: () => NEVER }),
    ).catch((error) => error);
    await jest.advanceTimersByTimeAsync(60000);
    expect(await expired).toBeInstanceOf(RequestTimeoutException);
  });
  test('已有后台任务免超时标记保持有效', async () => {
    const result = firstValueFrom(
      interceptor(60000, true).intercept(context, {
        handle: () => of('ready').pipe(delay(65000)),
      }),
    );
    await jest.advanceTimersByTimeAsync(65000);
    expect(await result).toBe('ready');
  });
});
