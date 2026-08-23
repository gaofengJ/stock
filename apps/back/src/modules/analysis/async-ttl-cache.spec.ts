import { AsyncTtlCache } from './async-ttl-cache';

describe('AsyncTtlCache', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-07-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('合并并发请求并在短时缓存到期后重新加载', async () => {
    const cache = new AsyncTtlCache(5000);
    const loader = jest.fn().mockResolvedValue('result');

    const first = cache.getOrCreate('same-query', loader);
    const second = cache.getOrCreate('same-query', loader);

    await expect(Promise.all([first, second])).resolves.toEqual([
      'result',
      'result',
    ]);
    expect(loader).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5001);
    await expect(cache.getOrCreate('same-query', loader)).resolves.toBe(
      'result',
    );
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('失败请求不会进入缓存', async () => {
    const cache = new AsyncTtlCache(5000);
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce('retry-result');

    await expect(cache.getOrCreate('failed-query', loader)).rejects.toThrow(
      'failed',
    );
    await expect(cache.getOrCreate('failed-query', loader)).resolves.toBe(
      'retry-result',
    );
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
