import { StockEntity } from '@/modules/source/stock/stock.entity';
import { WorkbenchService } from './workbench.service';
import { readProfileHistory } from './profile-reader';
import { BasicSnapshotService } from './snapshot.service';

const snapshot = (source: string, rows: any[] = []) => ({
  source,
  rows,
  key: source,
  state: 'ready',
  fetchedAt: '2026-10-05',
  message: null,
});

function fixture() {
  const quote = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => null),
  };
  const manager = {
    find: jest.fn(async () => [{ oldCode: '830001.BJ', newCode: '920001.BJ' }]),
    findOneBy: jest.fn(async (entity: any) =>
      entity === StockEntity
        ? { tsCode: '920001.BJ', name: '测试公司' }
        : { asOf: '2026-10-05', data: { stocks: [], names: [] } },
    ),
    getRepository: jest.fn(() => ({ createQueryBuilder: () => quote })),
  };
  const cache = { read: jest.fn(async (source: string) => snapshot(source)) };
  const sectors = { stockLinks: jest.fn(async () => []) };
  return {
    manager,
    cache,
    sectors,
    quote,
    service: new WorkbenchService(
      { manager, query: jest.fn(async () => [{ asOf: '2026-10-05' }]) } as any,
      cache as any,
      sectors as any,
    ),
  };
}

describe('progressive stock profile', () => {
  it('projects both current and old-code name records without returning unrelated stocks', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          asOf: '2026-10-05',
          stock0: '$.stocks[0].tsCode',
          name0: ['$.names[0].tsCode', '$.names[1].tsCode'],
          name1: '$.names[2].tsCode',
        },
      ])
      .mockResolvedValueOnce([
        {
          stocks: { tsCode: '920001.BJ' },
          names: [
            { tsCode: '920001.BJ', name: '新名称' },
            { tsCode: '600000.SH', name: '其他股票' },
            { tsCode: '830001.BJ', name: '旧名称' },
          ],
        },
      ]);
    const result = await readProfileHistory({ query } as any, [
      '920001.BJ',
      '830001.BJ',
    ]);
    expect(result?.data.stocks).toEqual([{ tsCode: '920001.BJ' }]);
    expect(result?.data.names.map((row) => row.name)).toEqual([
      '新名称',
      '旧名称',
    ]);
    expect(query.mock.calls[1][1]).toEqual([
      '$.stocks[0]',
      '$.names[0]',
      '$.names[1]',
      '$.names[2]',
    ]);
  });

  it('does not overwrite the whole company cache with one projected row when refresh fails', async () => {
    const manager = { update: jest.fn(async () => ({})), upsert: jest.fn() };
    const db = {
      query: async () => [
        {
          fetchedAt: new Date('2026-09-30'),
          retryAt: new Date(0),
          error: null,
          row0: { ts_code: '600081.SH', com_name: '东风科技' },
        },
      ],
      manager,
    };
    const cache = new BasicSnapshotService(
      db as any,
      {
        queryData: async () => {
          throw new Error('network');
        },
      } as any,
      { withLock: (job: any) => job(manager) } as any,
    );
    const result = await cache.read(
      'stock_company',
      { exchange: 'SSE' },
      'ts_code,com_name',
      ['600081.SH'],
    );
    expect(result.rows).toEqual([
      { ts_code: '600081.SH', com_name: '东风科技' },
    ]);
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ snapshotKey: expect.any(String) }),
      { error: '数据源暂不可用', retryAt: expect.any(Date) },
    );
    expect(manager.upsert).not.toHaveBeenCalled();
  });
  it('returns the overview without querying quotes or waiting for financial sources', async () => {
    const { service, manager, cache } = fixture();
    cache.read.mockImplementation(async (source) => {
      if (source !== 'stock_company') return new Promise(() => {});
      return snapshot(source, [
        { ts_code: '920001.BJ', com_name: '测试公司全称' },
      ]);
    });
    const result = await service.profile({
      code: '830001.BJ',
      date: '2026-09-30',
      section: 'overview',
    });
    expect(result).toMatchObject({
      code: '920001.BJ',
      company: { com_name: '测试公司全称' },
    });
    expect(cache.read.mock.calls.map(([source]) => source)).toEqual([
      'stock_company',
    ]);
    expect(manager.getRepository).not.toHaveBeenCalled();
  });

  it('financial polling skips stock history, company snapshots and sector queries', async () => {
    const { service, manager, cache, sectors } = fixture();
    await service.profile({
      code: '830001.BJ',
      date: '2026-09-30',
      section: 'financial',
    });
    await service.profile({
      code: '830001.BJ',
      date: '2026-09-30',
      section: 'financial',
    });
    expect(manager.find).toHaveBeenCalledTimes(1);
    expect(manager.findOneBy).not.toHaveBeenCalled();
    expect(manager.getRepository).not.toHaveBeenCalled();
    expect(sectors.stockLinks).not.toHaveBeenCalled();
    expect(cache.read.mock.calls.map(([source]) => source)).toEqual([
      'fina_indicator',
      'cashflow',
      'fina_indicator',
      'cashflow',
    ]);
  });

  it('preserves disclosure cutoffs and only pairs consolidated cashflow from the same report', async () => {
    const { service, cache } = fixture();
    cache.read.mockImplementation(async (source) =>
      snapshot(
        source,
        source === 'fina_indicator'
          ? [
              { end_date: '20260930', ann_date: '20261025' },
              { end_date: '20260630', ann_date: '20260825', profit_dedt: 58 },
            ]
          : [
              {
                end_date: '20260630',
                ann_date: '20260825',
                report_type: '1',
                n_cashflow_act: 48,
              },
              {
                end_date: '20260630',
                ann_date: '20260826',
                report_type: '2',
                n_cashflow_act: 99,
              },
              {
                end_date: '20260331',
                ann_date: '20260901',
                report_type: '1',
                n_cashflow_act: 11,
              },
            ],
      ),
    );
    const result = await service.profile({
      code: '830001.BJ',
      date: '2026-09-30',
      section: 'financial',
    });
    expect(result.financial?.profit_dedt).toBe(58);
    expect(result.cashflow?.n_cashflow_act).toBe(48);
    const earlier = await service.profile({
      code: '830001.BJ',
      date: '2026-06-01',
      section: 'financial',
    });
    expect(earlier.financial).toBeNull();
    expect(earlier.cashflow).toBeNull();
  });

  it('bounds the quote query for legacy clients that still request the whole profile', async () => {
    const { service, quote } = fixture();
    await service.profile({ code: '830001.BJ', date: '2026-09-30' });
    expect(quote.take).toHaveBeenCalledWith(1);
  });
});
