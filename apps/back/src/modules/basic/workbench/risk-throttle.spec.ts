import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorageService } from '@nestjs/throttler';
import { AuthController } from '@/modules/auth/auth.controller';
import { readThrottleTracker } from '@/modules/auth/read-throttle-tracker';
import { WorkbenchController } from './workbench.controller';

describe('risk reads behind the production proxy', () => {
  const context = (controller: any, handler: any, userId?: number): any => ({
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '172.19.0.1',
        authSession: userId ? { user_id: userId } : undefined,
        headers: { 'x-user-id': 'fake', 'x-forwarded-for': 'fake' },
      }),
      getResponse: () => ({ header: jest.fn() }),
    }),
  });

  it('allows normal list, preview and polling bursts per verified user but still bounds each user', async () => {
    const storage = new ThrottlerStorageService();
    const guard = new ThrottlerGuard(
      [{ ttl: 10000, limit: 7 }],
      storage,
      new Reflector(),
    );
    await guard.onModuleInit();
    try {
      await Promise.all(
        [
          WorkbenchController.prototype.risk,
          WorkbenchController.prototype.riskDetail,
        ].flatMap((handler) =>
          [1, 2, undefined].map(async (id) => {
            const request = context(WorkbenchController, handler, id);
            await expect(
              Promise.all(
                Array.from({ length: 30 }, () => guard.canActivate(request)),
              ),
            ).resolves.toEqual(Array(30).fill(true));
            await expect(guard.canActivate(request)).rejects.toMatchObject({
              status: 429,
            });
          }),
        ),
      );
      const login = context(AuthController, AuthController.prototype.login);
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

  it('never uses client headers or parameters as a verified identity', () => {
    const request: any = {
      ip: '172.19.0.1',
      headers: { 'x-user-id': '99', 'x-forwarded-for': '8.8.8.8' },
      query: { user_id: 99 },
      cookies: { user_id: '99' },
    };
    expect(readThrottleTracker(request)).toBe('ip:172.19.0.1');
    expect(
      readThrottleTracker({ ...request, authSession: { user_id: 1 } }),
    ).toBe('user:1');
  });
});
