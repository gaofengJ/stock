import { Agent } from 'https';
import { reductionRequest } from './reduction-request';

describe('reduction source retries', () => {
  it('recovers a reset using a fresh connection and paces every attempt with safe diagnostics', async () => {
    const pooled = new Agent({ keepAlive: true });
    const wait = jest.fn().mockResolvedValue(undefined);
    const beforeAttempt = jest.fn().mockResolvedValue(undefined);
    const onFailure = jest.fn();
    let destroyed: jest.SpyInstance | undefined;
    const get = jest
      .fn()
      .mockRejectedValueOnce({
        code: 'ECONNRESET',
        request: {
          reusedSocket: true,
          socket: { getProtocol: () => 'TLSv1.3' },
        },
        message: 'private-url-and-token',
      })
      .mockImplementationOnce(async (_url, config) => {
        expect(config.httpsAgent).not.toBe(pooled);
        expect(config.httpsAgent.options.keepAlive).toBe(false);
        destroyed = jest.spyOn(config.httpsAgent, 'destroy');
        return { data: 'complete' };
      });
    await expect(
      reductionRequest(
        get,
        'https://example.test',
        { httpsAgent: pooled },
        '正文',
        wait,
        { beforeAttempt, onFailure },
      ),
    ).resolves.toEqual({ data: 'complete' });
    expect(beforeAttempt).toHaveBeenCalledTimes(2);
    expect(destroyed).toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      stage: '正文',
      attempt: 1,
      code: 'ECONNRESET',
      reusedSocket: true,
      tlsConnected: true,
    });
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain('private');
    pooled.destroy();
  });
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
