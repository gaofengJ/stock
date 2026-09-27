import { DragonCache } from './dragon-cache';

describe('龙虎榜有界缓存', () => {
  afterEach(() => jest.useRealTimers());
  it('合并并发请求并缓存成功结果', async () => {
    const cache = new DragonCache<string[]>();
    const load = jest.fn().mockResolvedValue(['seat']);
    const result = await Promise.all([
      cache.get('a', load, (r) => !r.length),
      cache.get('a', load, (r) => !r.length),
    ]);
    expect(result).toEqual([['seat'], ['seat']]);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('空结果一分钟过期，失败不会缓存', async () => {
    jest.useFakeTimers();
    const cache = new DragonCache<string[]>();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue([]);
    await expect(cache.get('a', load, (r) => !r.length)).rejects.toThrow(
      'timeout',
    );
    await cache.get('a', load, (r) => !r.length);
    await jest.advanceTimersByTimeAsync(61000);
    await cache.get('a', load, (r) => !r.length);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('超过100项淘汰旧缓存，超大结果不留存', async () => {
    const cache = new DragonCache<string>();
    const load = jest.fn().mockResolvedValue('seat');
    for (let i = 0; i < 101; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await cache.get(String(i), load, () => false);
    }
    await cache.get('0', load, () => false);
    expect(load).toHaveBeenCalledTimes(102);
    const large = jest.fn().mockResolvedValue('x'.repeat(11 * 1024 * 1024));
    await cache.get('big', large, () => false);
    await cache.get('big', large, () => false);
    expect(large).toHaveBeenCalledTimes(2);
  });
});
