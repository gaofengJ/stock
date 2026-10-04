import { StrategyCacheService } from './strategy-cache.service';

describe('strategy result cache', () => {
  test('合并并发查询、隔离调用方修改，发布版本改变后重新计算', async () => {
    const query = jest.fn().mockResolvedValue([{ k: 'daily', v: 'success:1' }]);
    const cache = new StrategyCacheService({ query } as any);
    const loader = jest
      .fn()
      .mockResolvedValue([{ tsCode: '000001.SZ', name: 'old' }]);
    const [a, b] = await Promise.all([
      cache.read('2026-09-30', { key: 'a' }, loader),
      cache.read('2026-09-30', { key: 'a' }, loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    a[0].name = 'changed';
    expect(b[0].name).toBe('old');
    query.mockResolvedValue([{ k: 'daily', v: 'success:2' }]);
    await cache.read('2026-09-30', { key: 'a' }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
    query.mockResolvedValue([
      { k: 'daily', v: 'success:2' },
      { k: 'policy:date', v: 'manual-delete' },
    ]);
    await cache.read('2026-09-30', { key: 'a' }, loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });
  test('失败不缓存，不同参数不混用', async () => {
    const cache = new StrategyCacheService({ query: async () => [] } as any);
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValue([]);
    await expect(cache.read('2026-09-30', { n: 20 }, loader)).rejects.toThrow(
      'failed',
    );
    await cache.read('2026-09-30', { n: 20 }, loader);
    await cache.read('2026-09-30', { n: 30 }, loader);
    expect(loader).toHaveBeenCalledTimes(3);
  });
});
