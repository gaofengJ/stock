import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { NewsService } from './news.service';
import { NewsQuery } from './news.dto';

describe('News service safety', () => {
  const config = new ConfigService({ NEWS_SYNC_ENABLED: 'false' });
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
      42,
      '2026-09-30 16:00:00.000',
      '2026-10-01 16:00:00.000',
      '%!%!_!!%',
      '%!%!_!!%',
    ]);
    expect(query.mock.calls[0][0]).toContain('f.news_id IS NOT NULL');
  });
});
