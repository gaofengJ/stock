import { reductionRequest } from './reduction-request';

describe('reduction source retries', () => {
  it('recovers a transient 502 with bounded backoff', async () => {
    const get = jest
      .fn()
      .mockRejectedValueOnce({ response: { status: 502 } })
      .mockResolvedValue({ data: 'complete' });
    const wait = jest.fn().mockResolvedValue(undefined);
    await expect(
      reductionRequest(get, 'https://example.test', {}, '正文', wait),
    ).resolves.toEqual({ data: 'complete' });
    expect(get).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(1000);
  });

  it('stops after three attempts and never exposes the raw request error', async () => {
    const get = jest.fn().mockRejectedValue({
      response: { status: 503 },
      message: 'secret-token=private',
    });
    const wait = jest.fn().mockResolvedValue(undefined);
    await expect(
      reductionRequest(get, 'https://example.test', {}, '目录', wait),
    ).rejects.toThrow('减持公告目录获取失败（HTTP 503，尝试 3 次）');
    expect(get).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[1000], [2000]]);
  });

  it('does not repeatedly request a permanent HTTP error', async () => {
    const get = jest.fn().mockRejectedValue({ response: { status: 403 } });
    await expect(
      reductionRequest(get, 'https://example.test', {}, '正文'),
    ).rejects.toThrow('HTTP 403，尝试 1 次');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
