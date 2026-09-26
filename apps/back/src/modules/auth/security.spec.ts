/* eslint-disable no-restricted-syntax, no-continue, import/no-dynamic-require, global-require, @typescript-eslint/no-var-requires -- Inventory every real controller instead of testing a duplicate route list. */
import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ACCESS, PERMISSIONS } from './permissions';
import { logLines } from '../admin/log-lines';
import { redact } from './redact';
import { hashPassword, checkPassword } from './password';
import * as passwords from './password';

describe('authentication security boundaries', () => {
  it('preserves audit timestamps while redacting credentials', () => {
    expect(
      redact({ createdAt: new Date('2026-09-26T12:30:00Z'), token: 'private' }),
    ).toEqual({ createdAt: '2026-09-26T12:30:00.000Z', token: '[redacted]' });
    expect(redact(new Date('invalid'))).toBeNull();
  });
  it('never authenticates a cleared legacy credential using the timing dummy hash', async () => {
    const database: any = {
      query: jest
        .fn()
        .mockResolvedValue([{ id: 4, password: '', is_active: 1 }]),
      manager: { query: jest.fn() },
    };
    const service = new AuthService(database);
    const verify = jest
      .spyOn(passwords, 'checkPassword')
      .mockResolvedValue(true);
    try {
      await expect(
        service.login(
          { username: 'legacy', password: 'dummy-match' },
          {} as any,
          {} as any,
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      verify.mockRestore();
    }
  });
  it('denies an unclassified handler by default', async () => {
    const guard = new AuthGuard(new Reflector(), {} as AuthService);
    const context: any = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => ({ header: jest.fn() }),
      }),
      getHandler: () => () => {},
      getClass: () => class Unknown {},
    };
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('all active controller handlers explicitly declare existing permissions', () => {
    const root = path.resolve(__dirname, '..');
    const retired = ['user', 'role', 'permission', 'daily-task'];
    const catalog = new Set(PERMISSIONS.map((p) => p.code));
    let routes = 0;
    const visit = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (dir !== root || !retired.includes(entry.name))
            visit(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.controller.ts')) {
          const exports = require(path.join(dir, entry.name));
          for (const cls of Object.values(exports) as any[]) {
            if (!cls?.prototype) continue;
            for (const key of Object.getOwnPropertyNames(cls.prototype)) {
              const fn = cls.prototype[key];
              if (Reflect.getMetadata(METHOD_METADATA, fn) === undefined)
                continue;
              const rule =
                Reflect.getMetadata(ACCESS, fn) ||
                Reflect.getMetadata(ACCESS, cls);
              expect({
                controller: entry.name,
                method: key,
                classified: !!rule,
              }).toMatchObject({ classified: true });
              for (const permission of rule.any || [])
                expect(catalog.has(permission)).toBe(true);
              routes += 1;
            }
          }
        }
      }
    };
    visit(root);
    expect(routes).toBeGreaterThan(70);
  });
  it('uses salted Argon2id and rejects legacy credentials', async () => {
    const a = await hashPassword('fixture-long-password');
    const b = await hashPassword('fixture-long-password');
    expect(a).not.toEqual(b);
    expect(a).toMatch(/^\$argon2id\$/);
    expect(await checkPassword(a, 'fixture-long-password')).toBe(true);
    expect(await checkPassword(a, 'wrong-password')).toBe(false);
    expect(await checkPassword('legacy-plain', 'legacy-plain')).toBe(false);
  });
  it('redacts nested authentication material and preserves diagnostic fields', () => {
    const value = redact({
      password: 'secret-value',
      nested: { authorization: 'Bearer fixture', error: 'failure' },
      message: 'token=abc cookie=foo',
    });
    expect(JSON.stringify(value)).not.toMatch(
      /secret-value|Bearer fixture|abc|foo/,
    );
    expect(value.nested.error).toBe('failure');
  });
  it('bounds corrupt log lines and scanning bytes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-log-test-'));
    const file = path.join(dir, 'test.log');
    try {
      fs.writeFileSync(file, `${'x'.repeat(1100000)}\n{"level":"info"}\n`);
      const budget = { bytes: 2000000, truncated: false };
      const rows: string[] = [];
      for await (const row of logLines(file, budget)) rows.push(row);
      expect(rows).toEqual(['{oversized log line}', '{"level":"info"}']);
      const limited = { bytes: 1000, truncated: false };
      for await (const row of logLines(file, limited))
        expect(row.length).toBeLessThan(1000);
      expect(limited.truncated).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
