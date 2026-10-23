import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthController } from '@/modules/auth/auth.controller';
import { StrategyController } from './strategy.controller';

describe('continuous chart browsing behind a shared proxy', () => {
  it('gives each verified user 60 reads, preserves the bound and login protection', async () => {
    const storage = new ThrottlerStorageService();
    const guard = new ThrottlerGuard(
      [{ ttl: 10000, limit: 7 }],
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    const context = (controller: any, handler: any, userId?: number): any => ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '172.19.0.1',
          authSession: userId ? { user_id: userId } : undefined,
          headers: { 'x-user-id': 'spoofed' },
        }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    });
    try {
      // Administrator and ordinary accounts on the same proxy do not share quota.
      await Promise.all(
        [1, 2].map(async (id) => {
          const ctx = context(
            StrategyController,
            StrategyController.prototype.chart,
            id,
          );
          for (let i = 0; i < 60; i += 1) {
            // eslint-disable-next-line no-await-in-loop
            await expect(guard.canActivate(ctx)).resolves.toBe(true);
          }
          await expect(guard.canActivate(ctx)).rejects.toMatchObject({
            status: 429,
          });
        }),
      );
      const login = context(AuthController, AuthController.prototype.login);
      const access = context(
        AuthController,
        AuthController.prototype.access,
        3,
      );
      for (let i = 0; i < 60; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await expect(guard.canActivate(access)).resolves.toBe(true);
      }
      await expect(guard.canActivate(access)).rejects.toMatchObject({
        status: 429,
      });
      for (let i = 0; i < 7; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await expect(guard.canActivate(login)).resolves.toBe(true);
      }
      await expect(guard.canActivate(login)).rejects.toMatchObject({
        status: 429,
      });
    } finally {
      storage.onApplicationShutdown();
    }
  });
});
