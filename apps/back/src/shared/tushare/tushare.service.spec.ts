import { HttpService } from '@nestjs/axios';
import { TushareService } from './tushare.service';

describe('Tushare 请求失败处理', () => {
  const request = jest.fn();
  const service = new TushareService({
    axiosRef: { request },
  } as unknown as HttpService);
  beforeEach(() => {
    jest.useFakeTimers();
    request.mockReset();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('临时网络错误退避重试后成功', async () => {
    request.mockRejectedValueOnce({ code: 'ETIMEDOUT' }).mockResolvedValue({
      data: { code: 0, data: { fields: [], items: [] } },
    });
    const result = service.getDaily('20240701');
    await jest.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ code: 0 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('权限不足不重试，并向调用方报告失败', async () => {
    request.mockResolvedValue({ data: { code: -2002, msg: '没有接口权限' } });
    await expect(service.getDaily('20240701')).rejects.toThrow('没有接口权限');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('达到分页上限继续获取，重复页拒绝发布', async () => {
    request
      .mockResolvedValueOnce({
        data: { code: 0, data: { fields: ['ts_code'], items: [['a'], ['b']] } },
      })
      .mockResolvedValueOnce({
        data: { code: 0, data: { fields: ['ts_code'], items: [['c']] } },
      });
    const result = await service.queryData('daily', {}, undefined, 2);
    expect(result.data?.items).toEqual([['a'], ['b'], ['c']]);
    expect(request.mock.calls[1][0].data.params.offset).toBe(2);
    request.mockReset().mockResolvedValue({
      data: { code: 0, data: { fields: ['ts_code'], items: [['a'], ['b']] } },
    });
    await expect(service.queryData('daily', {}, undefined, 2)).rejects.toThrow(
      '分页重复',
    );
  });

  it('限流最多尝试三次，失败不会假装成功', async () => {
    request.mockResolvedValue({
      data: { code: -2001, msg: '每分钟访问次数超限' },
    });
    const assertion = expect(service.getDaily('20240701')).rejects.toThrow(
      '每分钟访问次数超限',
    );
    await jest.runAllTimersAsync();
    await assertion;
    expect(request).toHaveBeenCalledTimes(3);
  });
});
