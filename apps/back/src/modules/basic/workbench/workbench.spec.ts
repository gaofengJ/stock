import { StockEntity } from '@/modules/source/stock/stock.entity';
import { StockService } from '../stock/stock.service';
import { BasicSnapshotService } from './snapshot.service';
import {
  WorkbenchService,
  latestDisclosed,
  isoDate,
  groupUnlockEvents,
} from './workbench.service';

describe('basic workbench temporal and source safety', () => {
  it('selects only disclosed reports and prefers the most recent report period', () => {
    expect(
      latestDisclosed(
        [
          { end_date: '20260930', ann_date: '20261020', profit_dedt: 99 },
          { end_date: '20260630', ann_date: '20260801', profit_dedt: 10 },
          { end_date: '20260331', ann_date: '20260901', profit_dedt: 20 },
        ],
        '2026-09-30',
      )?.profit_dedt,
    ).toBe(10);
    expect(
      latestDisclosed([{ ann_date: '20261001' }], '2026-09-30'),
    ).toBeNull();
    expect(isoDate('20260930')).toBe('2026-09-30');
  });

  it('returns loading immediately and deduplicates concurrent source requests', async () => {
    let resolve: (v: any) => void;
    const request = new Promise((done) => {
      resolve = done;
    });
    const source = { queryData: jest.fn(() => request) };
    const manager = { findOneBy: jest.fn(async () => null), upsert: jest.fn() };
    const service = new BasicSnapshotService(
      { manager } as any,
      source as any,
      { withLock: (job: any) => job(manager) } as any,
    );
    const result = await Promise.all([
      service.read('stock_st', { trade_date: '20260930' }),
      service.read('stock_st', { trade_date: '20260930' }),
    ]);
    expect(result.map((r) => r.state)).toEqual(['loading', 'loading']);
    await new Promise((done) => {
      setTimeout(done, 5);
    });
    expect(source.queryData).toHaveBeenCalledTimes(1);
    resolve!({
      code: 0,
      data: { fields: ['ts_code'], items: [['000001.SZ']] },
    });
    await new Promise((done) => {
      setTimeout(done, 5);
    });
    expect(manager.upsert).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        rows: [{ ts_code: '000001.SZ' }],
        error: null,
      }),
      ['snapshotKey'],
    );
  });

  it('preserves a good snapshot after source failure, with a retry cooldown', async () => {
    const rows = [{ ts_code: '000001.SZ' }];
    const manager = {
      findOneBy: jest.fn(async () => ({
        rows,
        fetchedAt: new Date('2026-09-30'),
        retryAt: new Date(0),
      })),
      upsert: jest.fn(),
    };
    const service = new BasicSnapshotService(
      { manager } as any,
      { queryData: jest.fn().mockRejectedValue(new Error('积分不足')) } as any,
      { withLock: (job: any) => job(manager) } as any,
    );
    const result = await service.read('stock_st', { trade_date: '20260930' });
    expect(result.state).toBe('stale');
    expect(result.rows).toEqual(rows);
    await new Promise((done) => {
      setTimeout(done, 5);
    });
    const written = manager.upsert.mock.calls[0][1];
    expect(written.rows).toEqual(rows);
    expect(written.error).toContain('权限');
    expect(written.retryAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3600000,
    );
  });

  it('clears an expired failure message while a cached source is refreshing', async () => {
    const service = new BasicSnapshotService(
      {
        manager: {
          findOneBy: async () => ({
            rows: [{ ts_code: '600081.SH' }],
            fetchedAt: new Date('2026-09-30'),
            retryAt: new Date(0),
            error: '数据源暂不可用',
          }),
        },
      } as any,
      { queryData: () => new Promise(() => {}) } as any,
      {} as any,
    );
    const result = await service.read('stock_company', { exchange: 'SSE' });
    expect(result.state).toBe('stale');
    expect(result.message).toBeNull();
    expect(result.rows).toEqual([{ ts_code: '600081.SH' }]);
  });

  it('uses announcement-day forecast queries, floats in shares, and explicit pending sources', async () => {
    const cache = {
      read: jest.fn(async (source: string, params: any) => ({
        key: JSON.stringify([source, params]),
        source,
        state: 'ready',
        fetchedAt: '2026-09-30',
        message: null,
        rows:
          source === 'share_float' && params.start_date === '20261001'
            ? [
                {
                  ts_code: '000001.SZ',
                  float_date: '20261001',
                  float_share: 100000,
                  float_ratio: 1,
                },
              ]
            : [],
      })),
    };
    const builder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => ({ calDate: '2026-10-09' })),
    };
    Object.assign(cache, {
      readCalendarBatch: (requests: any[]) =>
        Promise.all(
          requests.map(([source, params]) => cache.read(source, params)),
        ),
    });
    const service = new WorkbenchService(
      {
        manager: {
          find: async () => [{ tsCode: '000001.SZ', name: '平安银行' }],
          getRepository: () => ({ createQueryBuilder: () => builder }),
        },
      } as any,
      cache as any,
      {} as any,
    );
    const data = await service.events({ date: '2026-09-30', days: '7' });
    expect(data.items).toHaveLength(1);
    const unlockCalls = cache.read.mock.calls.filter(
      ([api]) => api === 'share_float',
    );
    expect(unlockCalls).toHaveLength(7);
    expect(
      unlockCalls.every(([, params]) => params.start_date === params.end_date),
    ).toBe(true);
    expect(data.items[0].detail).toContain('10.00万股');
    expect(data.nextTradeDate).toBe('2026-10-09');
    const forecastCalls = cache.read.mock.calls.filter(
      ([api]) => api === 'forecast',
    );
    expect(forecastCalls.length).toBeGreaterThan(0);
    expect(
      forecastCalls.every(([, args]) => args.ann_date && !args.start_date),
    ).toBe(true);
    expect(
      cache.read.mock.calls.filter(([api]) => api === 'dividend'),
    ).toHaveLength(7);
  });
});

describe('basic stock directory', () => {
  it('keeps delisted companies searchable and resolves historical names and BSE aliases before pagination', async () => {
    const current = [{ tsCode: '920001.BJ', name: '现用名', listStatus: 'L' }];
    const service = new StockService(
      {
        manager: {
          find: async (entity: any) =>
            entity === StockEntity
              ? current
              : [{ oldCode: '830001.BJ', newCode: '920001.BJ' }],
          findOneBy: async () => ({
            asOf: '2026-10-04',
            data: {
              stocks: [
                {
                  tsCode: '600001.SH',
                  name: '退市公司',
                  delistDate: '2020-01-01',
                  listStatus: 'D',
                  profile: { actName: '历史实控人' },
                },
              ],
              names: [{ tsCode: '830001.BJ', name: '曾用名' }],
            },
          }),
          query: async (sql: string) => {
            if (sql.includes('$.names'))
              return [{ codes: ['830001.BJ'], names: ['曾用名'] }];
            if (sql.includes('$.stocks[*].tsCode'))
              return [{ asOf: '2026-10-04', codes: ['600001.SH'] }];
            return [
              {
                stocks: {
                  tsCode: '600001.SH',
                  name: '退市公司',
                  delistDate: '2020-01-01',
                  listStatus: 'D',
                  profile: { actName: '历史实控人' },
                },
              },
            ];
          },
        },
      } as any,
      { decorate: async (rows: any) => rows } as any,
    );
    const oldCode = await service.stock({
      tsCode: '830001',
      name: '曾用名',
      pageNum: 1,
      pageSize: 20,
    } as any);
    expect(oldCode.items.map((r: any) => r.tsCode)).toEqual(['920001.BJ']);
    const delisted = await service.stock({
      listStatus: 'D',
      pageNum: 1,
      pageSize: 20,
    } as any);
    expect(delisted.items[0]).toMatchObject({
      tsCode: '600001.SH',
      actName: '历史实控人',
    });
    expect(delisted.meta.totalItems).toBe(1);
    expect(delisted.profileAsOf).toBe('2026-10-04');
  });
});

describe('unlock calendar grouping', () => {
  it('combines holders without double counting revised announcements', () => {
    const base = {
      tsCode: '000001.SZ',
      eventDate: '2026-10-09',
      source: 'share_float',
      share_type: '限售股',
    };
    const rows = groupUnlockEvents([
      {
        ...base,
        holder_name: '甲',
        float_share: 10000,
        announcedAt: '2026-09-01',
      },
      {
        ...base,
        holder_name: '甲',
        float_share: 20000,
        announcedAt: '2026-09-02',
      },
      {
        ...base,
        holder_name: '乙',
        float_share: 30000,
        announcedAt: '2026-09-02',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      recordCount: 2,
      announcedAt: '2026-09-02',
    });
    expect(rows[0].detail).toContain('5.00万股');
  });
});
