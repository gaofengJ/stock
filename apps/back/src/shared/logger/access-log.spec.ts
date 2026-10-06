/* eslint-disable no-param-reassign -- Fixtures simulate identities established by authentication. */
import fastify from 'fastify';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LogsService } from '@/modules/admin/logs.service';
import { AuthService } from '@/modules/auth/auth.service';
import {
  accessQuery,
  AccessLogEntry,
  registerAccessLogging,
} from './access-log';
import { requestContext, requestLogFields } from './request-context';
import { AccessLogService } from './access-log.service';
import { LoggerService } from './logger.service';

describe('unified API access logging', () => {
  it('logs final responses, rejected requests and unmatched routes once, keeping concurrent identities isolated', async () => {
    const server = fastify();
    const entries: AccessLogEntry[] = [];
    registerAccessLogging(server, (entry) => entries.push(entry));
    server.get('/api/user/:id', async (req) => {
      const id = Number((req.params as any).id);
      Object.assign(req.logContext!, {
        actorType: 'user',
        userId: id,
        username: `user${id}`,
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 30 - id);
      });
      const fields = requestLogFields();
      expect(fields.userId).toBe(id);
      return fields;
    });
    server.get('/api/denied', async (_req, reply) =>
      reply.code(403).send({ message: '无权访问' }),
    );
    server.get('/api/broken', async () => {
      throw new Error('fixture');
    });
    server.get('/health', async () => ({ okay: true }));
    try {
      const responses = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          server.inject({
            method: 'GET',
            url: `/api/user/${i + 1}?page=2&password=private-query`,
            headers: {
              'x-request-id': 'untrusted',
              authorization: 'private-header',
            },
          }),
        ),
      );
      responses.forEach((response, i) => {
        const id = response.headers['x-request-id'];
        expect(id).toMatch(/^[a-f0-9-]{36}$/);
        expect(response.json().requestId).toBe(id);
        const entry = entries.find((row) => row.requestId === id)!;
        expect(entry.userId).toBe(i + 1);
        expect(entry.route).toBe('/api/user/:id');
        expect(entry.query).toEqual({ page: '2' });
        expect(entry.result).toBe('success');
      });
      await server.inject('/api/denied');
      await server.inject('/api/broken');
      await server.inject('/api/unknown');
      await server.inject('/health');
      expect(entries).toHaveLength(13);
      expect(entries.find((e) => e.path === '/api/denied')?.statusCode).toBe(
        403,
      );
      expect(entries.find((e) => e.path === '/api/broken')?.result).toBe(
        'server-error',
      );
      expect(entries.find((e) => e.path === '/api/unknown')?.statusCode).toBe(
        404,
      );
      expect(new Set(entries.map((e) => e.requestId)).size).toBe(13);
      expect(JSON.stringify(entries)).not.toContain('private-');
      expect(requestContext.getStore()).toBeUndefined();
    } finally {
      await server.close();
    }
  });

  it('records disconnected requests once without changing completed responses when the writer fails', async () => {
    const server = fastify();
    let recorded: (entry: AccessLogEntry) => void;
    const disconnected = new Promise<AccessLogEntry>((resolve) => {
      recorded = resolve;
    });
    const entries: AccessLogEntry[] = [];
    registerAccessLogging(server, (entry) => {
      entries.push(entry);
      recorded(entry);
    });
    let entered: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish: () => void = () => {};
    const processing = new Promise<void>((resolve) => {
      finish = resolve;
    });
    server.get('/api/wait', async () => {
      entered();
      await processing;
      return {};
    });
    const address = await server.listen({ port: 0, host: '127.0.0.1' });
    const req = http.get(`${address}/api/wait`);
    req.on('error', () => {});
    try {
      await ready;
      req.destroy();
      expect((await disconnected).result).toBe('aborted');
      expect(entries[0].statusCode).toBe(499);
      finish();
    } finally {
      finish();
      await server.close();
    }
    expect(entries).toHaveLength(1);
    const healthy = fastify();
    registerAccessLogging(healthy, () => {
      throw new Error('disk failure');
    });
    healthy.get('/api/okay', async () => ({ okay: true }));
    try {
      expect((await healthy.inject('/api/okay')).statusCode).toBe(200);
    } finally {
      await healthy.close();
    }
  });

  it('never retains bodies, free text, credentials or arbitrary query keys', () => {
    expect(
      accessQuery(
        '/api/auth/login?username=private-name&password=private-password&token=private-token&keyword=private-text&page=2&tradeDate=2026-10-06',
      ),
    ).toEqual({ page: '2', tradeDate: '2026-10-06' });
    expect(accessQuery('/api/read?code=1&code=2')).toEqual({
      code: ['1', '2'],
    });
  });

  it('flushes independent access files readable by the admin query on shutdown', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'stock-access-writer-'),
    );
    const old = process.env.LOG_DIR;
    process.env.LOG_DIR = directory;
    try {
      const writer = new AccessLogService();
      writer.write({
        requestId: '12345678-1234-1234-1234-123456789abc',
        method: 'GET',
        path: '/api/read',
        route: '/api/read',
        actorType: 'user',
        userId: 1,
        username: 'alice',
        timestamp: new Date().toISOString(),
        statusCode: 200,
        result: 'success',
        durationMs: 10,
        ip: '127.0.0.1',
        ipSource: 'connection',
        userAgent: 'test',
        query: {},
      });
      await writer.onModuleDestroy();
      const result = await new LogsService({} as any).access({
        page: 1,
        pageSize: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].username).toBe('alice');
      expect(result.retentionDays).toBe(30);
      expect(
        fs
          .readdirSync(directory)
          .some((file) => file.startsWith('stock-back.')),
      ).toBe(false);
    } finally {
      if (old === undefined) delete process.env.LOG_DIR;
      else process.env.LOG_DIR = old;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('correlates human audits and leaves scheduled audit records without an invented request', async () => {
    const manager = { query: jest.fn().mockResolvedValue({}) };
    const auth = new AuthService({ manager } as any);
    await requestContext.run(
      {
        requestId: '12345678-1234-1234-1234-123456789abc',
        method: 'PATCH',
        path: '/api/admin/users/2',
        actorType: 'user',
      },
      () =>
        auth.audit({ id: 1, username: 'admin' }, 'user.update', 2, 'success', {
          active: false,
          password: 'secret-value',
        }),
    );
    const detail = JSON.parse(manager.query.mock.calls[0][1][5]);
    expect(detail.requestId).toBe('12345678-1234-1234-1234-123456789abc');
    expect(detail.password).toBe('[redacted]');
    await auth.audit(null, 'sync.complete', 1);
    expect(manager.query.mock.calls[1][1][5]).toBeNull();
  });

  it('adds the same request and account to structured system errors without exposing credentials', async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), 'stock-system-writer-'),
    );
    const old = process.env.LOG_DIR;
    const oldTimezone = process.env.TZ;
    process.env.TZ = 'Asia/Shanghai';
    process.env.LOG_DIR = directory;
    try {
      const logger = new LoggerService({
        get: () => ({ level: 'info', maxFiles: 5 }),
      } as any);
      logger.setLogLevels([]);
      requestContext.run(
        {
          requestId: '12345678-1234-1234-1234-123456789abc',
          method: 'GET',
          path: '/api/read',
          actorType: 'user',
          userId: 2,
          username: 'alice',
        },
        () =>
          logger.error(
            { message: 'fixture', password: 'secret-value' },
            undefined,
            'Fixture',
          ),
      );
      await logger.onModuleDestroy();
      const result = await new LogsService({} as any).application({
        page: 1,
        pageSize: 20,
      });
      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        kind: 'system',
        requestId: '12345678-1234-1234-1234-123456789abc',
        username: 'alice',
        context: 'Fixture',
      });
      expect(JSON.stringify(result)).not.toContain('secret-value');
    } finally {
      if (old === undefined) delete process.env.LOG_DIR;
      else process.env.LOG_DIR = old;
      if (oldTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = oldTimezone;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
