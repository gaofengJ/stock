import { DailyService } from './daily.service';

describe('basic daily read cache', () => {
  afterEach(() => jest.restoreAllMocks());

  it('isolates dates, scopes, filters, sort order and pages while expiring promptly', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const list = jest.fn(async (query) => ({
      items: [query],
      meta: { totalItems: 1 },
    }));
    const service = new DailyService({ list } as any);
    const query = { tradeDate: '2026-09-30', pageNum: 1, pageSize: 20 };
    await Promise.all([service.daily(query), service.daily(query)]);
    expect(list).toHaveBeenCalledTimes(1);
    await Promise.all(
      [
        { tradeDate: '2026-09-29' },
        { scope: 'bj' },
        { pageNum: 2 },
        { name: '平安' },
        { orderField: 'pctChg', order: 'DESC' },
      ].map(async (extra) => {
        const changed = { ...query, ...extra };
        expect((await service.daily(changed as any)).items[0]).toEqual(changed);
      }),
    );
    expect(list).toHaveBeenCalledTimes(6);
    clock.mockReturnValue(11001);
    await service.daily(query);
    expect(list).toHaveBeenCalledTimes(7);
  });

  it('allows immediate retry after a failed source query', async () => {
    const list = jest
      .fn()
      .mockRejectedValueOnce(new Error('暂不可用'))
      .mockResolvedValue({ items: [], meta: {} });
    const service = new DailyService({ list } as any);
    const query = { pageNum: 1, pageSize: 20 };
    await expect(service.daily(query)).rejects.toThrow('暂不可用');
    await expect(service.daily(query)).resolves.toEqual({
      items: [],
      meta: {},
    });
    expect(list).toHaveBeenCalledTimes(2);
  });
});
