import { StockEntity } from '@/modules/source/stock/stock.entity';
import { StockService } from './stock.service';

describe('stock directory pagination and cache', () => {
  afterEach(() => jest.restoreAllMocks());

  function setup() {
    const rows = ['000001.SZ', '000002.SZ', '000003.SZ'].map((tsCode) => ({
      tsCode,
      name: tsCode,
      listStatus: 'L',
      fullname: `${tsCode}完整资料`,
    }));
    const find = jest.fn().mockImplementation((entity, options) => {
      if (entity !== StockEntity) return [];
      return options.select
        ? rows.map(({ tsCode, name, listStatus }) => ({
            tsCode,
            name,
            listStatus,
          }))
        : rows;
    });
    const query = jest
      .fn()
      .mockResolvedValue([
        { asOf: '2026-10-06', codes: rows.map((r) => r.tsCode) },
      ]);
    const decorate = jest.fn(async (selected) => selected);
    const service = new StockService(
      { manager: { find, query } } as any,
      { decorate } as any,
    );
    return { service, find, query };
  }

  it('returns full profiles after pagination and shares identical in-flight reads', async () => {
    const { service, find, query } = setup();
    const first = { pageNum: 1, pageSize: 1 };
    const [a, b] = await Promise.all([
      service.stock(first),
      service.stock(first),
    ]);
    expect(a).toEqual(b);
    expect(a.items).toEqual([
      {
        tsCode: '000001.SZ',
        name: '000001.SZ',
        listStatus: 'L',
        fullname: '000001.SZ完整资料',
      },
    ]);
    expect(a.meta.totalItems).toBe(3);
    const second = await service.stock({ pageNum: 2, pageSize: 1 });
    expect(second.items[0].tsCode).toBe('000002.SZ');
    expect(query).toHaveBeenCalledTimes(1);
    const reads = find.mock.calls.filter(([entity]) => entity === StockEntity);
    expect(reads).toHaveLength(3);
    expect(reads[1][1].where.tsCode.value).toEqual(['000001.SZ']);
    expect(reads[2][1].where.tsCode.value).toEqual(['000002.SZ']);
  });

  it('expires cached directory data and never caches a failed read', async () => {
    const { service, query } = setup();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    query.mockRejectedValueOnce(new Error('数据库暂不可用'));
    const page = { pageNum: 1, pageSize: 1 };
    await expect(service.stock(page)).rejects.toThrow('数据库暂不可用');
    expect((await service.stock(page)).meta.totalItems).toBe(3);
    clock.mockReturnValue(32001);
    await service.stock(page);
    expect(query).toHaveBeenCalledTimes(3);
  });
});
