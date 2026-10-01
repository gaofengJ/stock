import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthController } from './auth.controller';

describe('article resource authorization bursts', () => {
  it('allows resource checks from the shared proxy IP while keeping login throttled', async () => {
    const storage = new ThrottlerStorageService();
    const guard = new ThrottlerGuard(
      [{ ttl: 10000, limit: 7 }],
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    const context = (handler: any): any => ({
      getHandler: () => handler,
      getClass: () => AuthController,
      switchToHttp: () => ({
        getRequest: () => ({ ip: '172.17.0.1', headers: {} }),
        getResponse: () => ({ header: jest.fn() }),
      }),
    });
    try {
      const article = context(AuthController.prototype.blogAccess);
      await expect(
        Promise.all(
          Array.from({ length: 50 }, () => guard.canActivate(article)),
        ),
      ).resolves.toEqual(Array(50).fill(true));
      const login = context(AuthController.prototype.login);
      await expect(
        Promise.all(Array.from({ length: 7 }, () => guard.canActivate(login))),
      ).resolves.toEqual(Array(7).fill(true));
      await expect(guard.canActivate(login)).rejects.toMatchObject({
        status: 429,
      });
    } finally {
      storage.onApplicationShutdown();
    }
  });
});
