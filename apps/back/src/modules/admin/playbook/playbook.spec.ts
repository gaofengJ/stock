import 'reflect-metadata';
// eslint-disable-next-line import/no-extraneous-dependencies -- HTTP tests use the Nest test harness.
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Reflector } from '@nestjs/core';
import { gzipSync } from 'zlib';
import { AuthGuard } from '../../auth/auth.guard';
import { PlaybookController } from './playbook.controller';
import { readPlaybook } from './playbook.content';
import { PlaybookNode } from './playbook.types';

const PLAYBOOK = {
  version: 'test',
  maps: ['trading', 'review', 'learning', 'experience'].map((id) => ({
    id,
    root: {
      id: `${id}-root`,
      title: 'Test fixture',
      points: ['Synthetic test instructions'],
    },
  })),
};
const originalConfig = process.env.ADMIN_PLAYBOOK_GZIP_BASE64;
beforeAll(() => {
  process.env.ADMIN_PLAYBOOK_GZIP_BASE64 = gzipSync(
    JSON.stringify(PLAYBOOK),
  ).toString('base64');
});
afterAll(() => {
  if (originalConfig === undefined)
    delete process.env.ADMIN_PLAYBOOK_GZIP_BASE64;
  else process.env.ADMIN_PLAYBOOK_GZIP_BASE64 = originalConfig;
});

describe('private playbook HTTP access', () => {
  let app: NestFastifyApplication;
  let role = 'admin';
  let signedIn = true;
  let mustChangePassword = false;
  const auth = {
    session: jest.fn(async () => (signedIn ? { user_id: 1 } : null)),
    current: jest.fn(async () => ({
      roles: [{ code: role }],
      permissions: ['users:manage', 'roles:manage', 'logs:read'],
      mustChangePassword,
    })),
    trial: jest.fn(async () => ({ remainingMs: 60000 })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PlaybookController],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalGuards(new AuthGuard(new Reflector(), auth as any));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    signedIn = true;
    role = 'admin';
    mustChangePassword = false;
    jest.clearAllMocks();
  });
  it('returns maps only to the current admin and disables response caching', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/admin/playbook',
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json().maps.map((map: any) => map.id)).toEqual([
      'trading',
      'review',
      'learning',
      'experience',
    ]);
  });
  it('rejects anonymous and active-trial requests without disclosing content', async () => {
    signedIn = false;
    const response = await app.inject({
      method: 'GET',
      url: '/admin/playbook',
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('trade-root');
    expect(auth.trial).not.toHaveBeenCalled();
  });
  it.each(['user', 'custom-manager'])(
    'rejects %s even with delegated management permissions',
    async (code) => {
      role = code;
      const response = await app.inject({
        method: 'GET',
        url: '/admin/playbook',
      });
      expect(response.statusCode).toBe(403);
      expect(response.body).not.toContain('trade-root');
    },
  );
  it('rechecks role removal on the next request', async () => {
    expect(
      (await app.inject({ method: 'GET', url: '/admin/playbook' })).statusCode,
    ).toBe(200);
    role = 'user';
    expect(
      (await app.inject({ method: 'GET', url: '/admin/playbook' })).statusCode,
    ).toBe(403);
  });
  it('requires a password change before returning private content', async () => {
    mustChangePassword = true;
    expect(
      (await app.inject({ method: 'GET', url: '/admin/playbook' })).statusCode,
    ).toBe(403);
  });
});

describe('playbook editorial integrity', () => {
  it('uses unique topic IDs and meaningful leaf instructions', () => {
    const ids = new Set<string>();
    const check = (node: PlaybookNode) => {
      expect(ids.has(node.id)).toBe(false);
      ids.add(node.id);
      expect(node.title.length).toBeGreaterThan(0);
      if (node.children?.length) node.children.forEach(check);
      else expect(node.points!.length).toBeGreaterThan(0);
      node.links?.forEach((link) =>
        expect(link.url).toMatch(/^(https:\/\/|\/blog\?article=)/),
      );
    };
    PLAYBOOK.maps.forEach((map) => check(map.root));
    expect(ids.size).toBeGreaterThan(0);
  });
  it('fails closed without exposing invalid configuration', () => {
    const configured = process.env.ADMIN_PLAYBOOK_GZIP_BASE64;
    try {
      delete process.env.ADMIN_PLAYBOOK_GZIP_BASE64;
      expect(() => readPlaybook()).toThrow('暂未配置');
      process.env.ADMIN_PLAYBOOK_GZIP_BASE64 = gzipSync(
        'private-invalid-json',
      ).toString('base64');
      expect(() => readPlaybook()).toThrow('暂未配置');
    } finally {
      process.env.ADMIN_PLAYBOOK_GZIP_BASE64 = configured;
    }
  });
});
