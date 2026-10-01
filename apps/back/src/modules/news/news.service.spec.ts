import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { NewsService } from './news.service';
import { NewsQuery } from './news.dto';
import { NEWS_SOURCES, isNewsSource } from './news.sources';

describe('News service safety', () => {
  const config = new ConfigService({ NEWS_SYNC_ENABLED: 'false' });
  it('interprets MySQL string flags without marking another reader as read', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 1,
          already_read: '0',
          favorite: '0',
          important: '0',
          title: '新闻',
        },
      ])
      .mockResolvedValue([]);
    const item = await new NewsService(
      { query } as unknown as DataSource,
      config,
    ).detail(1, 42);
    expect(item.read).toBe(false);
    expect(item.favorite).toBe(false);
    expect(item.important).toBe(false);
  });
  it('hides retired, failed, disabled and never-collected subscriptions from readers', async () => {
    const success = new Date('2026-10-01T00:00:00Z');
    const rows = [
      { source: 'jin10', enabled: 1, status: 'ok', last_success: success },
      {
        source: 'yicai',
        enabled: 1,
        status: 'collecting',
        last_success: success,
      },
      {
        source: 'stcn',
        enabled: 1,
        status: 'error',
        last_success: success,
        last_error: 'Unavailable',
      },
      {
        source: 'wallstreetcn',
        enabled: 1,
        status: 'collecting',
        last_success: success,
        last_error: 'Retrying',
      },
      {
        source: 'yicai-news',
        enabled: 1,
        status: 'pending',
        last_success: null,
      },
      { source: 'bloomberg', enabled: 0, status: 'ok', last_success: success },
      { source: 'em-stock', enabled: 1, status: 'ok', last_success: success },
    ];
    const service = new NewsService(
      { query: jest.fn().mockResolvedValue(rows) } as unknown as DataSource,
      config,
    );
    expect((await service.sources()).sources.map((s) => s.code)).toEqual([
      'jin10',
      'yicai',
    ]);
    const managed = (await service.sources(true)).sources;
    expect(managed.find((s) => s.code === 'stcn')?.lastError).toBe(
      'Unavailable',
    );
    expect(managed.some((s) => s.code === 'em-stock')).toBe(false);
  });
  it('rejects attempts to re-enable retired research subscriptions', async () => {
    const query = jest.fn();
    const service = new NewsService({ query } as unknown as DataSource, config);
    await expect(
      service.updateSource('em-stock', { enabled: true }),
    ).rejects.toThrow('研报来源');
    expect(query).not.toHaveBeenCalled();
  });
  it('does not release another collector’s named lock', async () => {
    const runner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest.fn().mockResolvedValue([{ acquired: 0 }]),
    };
    const db = { createQueryRunner: () => runner } as unknown as DataSource;
    expect(await new NewsService(db, config).sync()).toBe(false);
    expect(runner.query).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it('releases its own lock after a database failure and allows retry', async () => {
    const runner = {
      connect: jest.fn(),
      release: jest.fn(),
      query: jest
        .fn()
        .mockResolvedValueOnce([{ acquired: 1 }])
        .mockRejectedValueOnce(new Error('DB unavailable'))
        .mockResolvedValue([]),
    };
    const service = new NewsService(
      { createQueryRunner: () => runner } as unknown as DataSource,
      config,
    );
    await expect(service.sync()).rejects.toThrow('DB unavailable');
    expect(runner.query).toHaveBeenCalledWith(
      "SELECT RELEASE_LOCK('stock:news-sync')",
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
    runner.query.mockResolvedValue([{ acquired: 0 }]);
    expect(await service.sync()).toBe(false);
  });
  it('requires a signed in owner for favorites and rejects unknown sources', async () => {
    const db = { query: jest.fn() } as unknown as DataSource;
    const service = new NewsService(db, config);
    await expect(service.favorite(1, undefined, true)).rejects.toThrow(
      '请登录',
    );
    await expect(
      service.list({ ...new NewsQuery(), favorites: 'true' }),
    ).rejects.toThrow('请登录');
    await expect(
      service.updateSource('http://internal', { enabled: true }),
    ).rejects.toThrow('未知资讯来源');
    expect(db.query).not.toHaveBeenCalled();
  });
  it('escapes wildcard searches and binds the user rather than trusting query input', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);
    const service = new NewsService({ query } as unknown as DataSource, config);
    await service.list(
      {
        ...new NewsQuery(),
        date: '2026-10-01',
        keyword: '%_!',
        favorites: 'true',
      },
      42,
    );
    expect(query.mock.calls[0][1]).toEqual([
      2147483647,
      42,
      ...NEWS_SOURCES.filter(isNewsSource).map((source) => source.code),
      '2026-09-30 16:00:00.000',
      '2026-10-01 16:00:00.000',
      '%!%!_!!%',
      '%!%!_!!%',
      '%!%!_!!%',
      '%!%!_!!%',
    ]);
    expect(query.mock.calls[0][0]).toContain('f.news_id IS NOT NULL');
  });
});
