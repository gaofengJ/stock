import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthService, TRIAL_COOKIE, digest } from './auth.service';
import { ACCESS } from './permissions';
import { AuthController } from './auth.controller';

describe('guest access and login activity', () => {
  function guardFixture(rule: any, method = 'GET', remainingMs = 100) {
    const handler = () => {};
    Reflect.defineMetadata(ACCESS, rule, handler);
    const auth = {
      session: jest.fn().mockResolvedValue(null),
      trial: jest.fn().mockResolvedValue({ remainingMs }),
    };
    const request = { method, url: '/example', headers: {} };
    const context: any = {
      getHandler: () => handler,
      getClass: () => class Test {},
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header: jest.fn() }),
      }),
    };
    return {
      guard: new AuthGuard(new Reflector(), auth as any),
      context,
      auth,
    };
  }

  it('allows business reads until the exact trial deadline', async () => {
    const active = guardFixture({ any: ['analysis:overview'] });
    await expect(active.guard.canActivate(active.context)).resolves.toBe(true);
    const expired = guardFixture({ any: ['analysis:overview'] }, 'GET', 0);
    await expect(
      expired.guard.canActivate(expired.context),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('uses the real article access endpoint to enforce guest expiration and role permissions', async () => {
    const rule = Reflect.getMetadata(
      ACCESS,
      AuthController.prototype.blogAccess,
    );
    expect(rule).toEqual({ any: ['blog:read'] });
    const active = guardFixture(rule);
    await expect(active.guard.canActivate(active.context)).resolves.toBe(true);
    const expired = guardFixture(rule, 'GET', 0);
    await expect(
      expired.guard.canActivate(expired.context),
    ).rejects.toMatchObject({ status: 401 });
    await Promise.all(
      [[], ['blog:read']].map(async (permissions) => {
        const f = guardFixture(rule);
        f.auth.session.mockResolvedValue({ user_id: 7 } as any);
        (f.auth as any).current = jest
          .fn()
          .mockResolvedValue({ permissions, mustChangePassword: false });
        if (permissions.length)
          await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
        else
          await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
            status: 403,
          });
        expect(f.auth.trial).not.toHaveBeenCalled();
      }),
    );
  });

  it.each([
    [{ any: ['users:manage'] }, 'GET'],
    [{ login: true }, 'GET'],
    [{ any: ['analysis:overview'] }, 'POST'],
    [{ any: ['data:write'] }, 'DELETE'],
  ])(
    'never grants guests account, administration or write access',
    async (rule, method) => {
      const f = guardFixture(rule, method);
      await expect(f.guard.canActivate(f.context)).rejects.toMatchObject({
        status: 401,
      });
      expect(f.auth.trial).not.toHaveBeenCalled();
    },
  );

  it('allows only explicitly marked shared lookup reads', async () => {
    const f = guardFixture({ login: true, guestRead: true });
    await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
  });

  it('issues one fixed deadline and does not renew an expired marker', async () => {
    const db = { query: jest.fn().mockResolvedValue([]) };
    const auth = new AuthService(db as any);
    const reply = { setCookie: jest.fn() };
    await auth.trial({ cookies: {} } as any, reply as any, true);
    const token = reply.setCookie.mock.calls[0][1];
    expect(reply.setCookie).toHaveBeenCalledWith(
      TRIAL_COOKIE,
      token,
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 31536000,
      }),
    );
    expect(db.query.mock.calls[0][0]).toContain('INTERVAL 5 MINUTE');
    db.query.mockClear();
    reply.setCookie.mockClear();
    await expect(
      auth.trial(
        { cookies: { [TRIAL_COOKIE]: token } } as any,
        reply as any,
        true,
      ),
    ).resolves.toEqual({ remainingMs: 0 });
    expect(reply.setCookie).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][1]).toEqual([
      digest(token),
      digest(`trial:${token}`),
    ]);
  });

  it('does not start a trial while simply visiting login', async () => {
    const db = { query: jest.fn() };
    const auth = new AuthService(db as any);
    await expect(
      auth.access({ cookies: {} } as any, {} as any, false),
    ).resolves.toEqual({ user: null, trial: null });
    expect(db.query).not.toHaveBeenCalled();
  });

  it('suppresses administrator activity and distinguishes automatic registration login', async () => {
    const auth = new AuthService({} as any);
    const audit = jest.spyOn(auth, 'audit').mockResolvedValue();
    const manager = {} as any;
    await auth.memberLogin(
      { id: 1, roles: [{ code: 'admin' }] } as any,
      manager,
    );
    expect(audit).not.toHaveBeenCalled();
    const user = { id: 2, username: 'alice', roles: [{ code: 'user' }] } as any;
    await auth.memberLogin(user, manager, true);
    expect(audit).toHaveBeenCalledWith(
      user,
      'auth.member-login',
      2,
      'success',
      { registered: true },
      manager,
    );
  });

  it('marks only a real displayed snapshot and keeps each administrator cursor separate', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 42 }])
        .mockResolvedValueOnce([]),
    };
    const auth = new AuthService(db as any);
    await auth.readLoginActivity({ id: 7 } as any, 43);
    expect(db.query.mock.calls[0][1]).toEqual([43]);
    expect(db.query.mock.calls[1][1]).toEqual([7, 42]);
    expect(db.query.mock.calls[1][0]).toContain(
      'GREATEST(last_read_id,VALUES(last_read_id))',
    );
  });
});
