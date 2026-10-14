import { TushareService } from './tushare.service';

describe('isolated migration rehearsal', () => {
  it('never contacts the provider when external requests are disabled', async () => {
    const old = process.env.TUSHARE_REQUESTS_ENABLED;
    process.env.TUSHARE_REQUESTS_ENABLED = 'false';
    const request = jest.fn();
    try {
      const service = new TushareService({ axiosRef: { request } } as any);
      await expect(service.getTradeCal('2026')).rejects.toThrow(
        '当前环境未启用外部行情请求',
      );
      await expect(
        service.queryLiveData('daily', {}, 'ts_code', 100, Date.now() + 5000),
      ).rejects.toThrow('当前环境未启用外部行情请求');
      expect(request).not.toHaveBeenCalled();
    } finally {
      if (old === undefined) delete process.env.TUSHARE_REQUESTS_ENABLED;
      else process.env.TUSHARE_REQUESTS_ENABLED = old;
    }
  });
});
