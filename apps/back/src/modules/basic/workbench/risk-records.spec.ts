import { StockEntity } from '@/modules/source/stock/stock.entity';
import { WorkbenchService } from './workbench.service';
import { BasicSnapshotService } from './snapshot.service';

describe('risk record dates and targeted reads', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps ST status, announcement and implementation dates separate and retains historical changes', async () => {
    const read = jest.fn(async (source: string) => ({
      source,
      state: 'ready',
      rows:
        (
          {
            stock_st: [
              {
                ts_code: '000010.SZ',
                trade_date: '20260930',
                type_name: '*ST',
              },
            ],
            st: [
              {
                ts_code: '000010.SZ',
                pub_date: '20260428',
                imp_date: '20260429',
                st_type: '*ST',
                st_explain: '年度审计异常',
              },
              {
                ts_code: '000010.SZ',
                pub_date: '20260901',
                imp_date: '20260902',
                st_type: '叠加ST',
                st_explain: '治理异常',
              },
              {
                ts_code: '000010.SZ',
                pub_date: '20261001',
                imp_date: '20261002',
                st_explain: '未来变更',
              },
            ],
          } as any
        )[source] || [],
    }));
    const find = jest.fn(async () => []);
    const findOneBy = jest.fn(async () => ({
      tsCode: '000010.SZ',
      name: '*ST样本',
    }));
    const query = jest.fn();
    const decorate = jest.fn();
    const service = new WorkbenchService(
      { manager: { find, findOneBy }, query } as any,
      { read } as any,
      { decorate } as any,
    );
    const dto = { code: '000010.SZ', date: '2026-09-30' };
    const result = await service.risk(dto);
    expect(result.items[0]).toMatchObject({
      statusDate: '2026-09-30',
      announcementDate: '2026-09-01',
      effectiveDate: '2026-09-02',
      eventDate: '2026-09-01',
      detail: '治理异常',
    });
    expect(result.items[0].changes).toHaveLength(2);
    expect(result.name).toBe('*ST样本');
    expect(findOneBy).toHaveBeenCalledWith(StockEntity, {
      tsCode: '000010.SZ',
    });
    expect(query).not.toHaveBeenCalled();
    expect(decorate).not.toHaveBeenCalled();
    expect(
      read.mock.calls.every(
        (call: any[]) => call[3]?.[0] === '000010.SZ' && call[4] === true,
      ),
    ).toBe(true);
    await service.risk(dto);
    expect(read).toHaveBeenCalledTimes(12);
  });

  it('does not invent announcement dates and canonicalizes old-code filters', async () => {
    const service = new WorkbenchService(
      {
        manager: {
          find: async () => [{ oldCode: '830001.BJ', newCode: '920001.BJ' }],
          findOneBy: async () => ({ name: '样本' }),
        },
      } as any,
      {
        read: async (source: string) => ({
          source,
          state: 'ready',
          rows:
            source === 'stock_st'
              ? [{ ts_code: '830001.BJ', trade_date: '20260930' }]
              : [],
        }),
      } as any,
      {} as any,
    );
    const result = await service.risk({
      code: '830001.BJ',
      date: '2026-09-30',
    });
    expect(result.items[0]).toMatchObject({
      tsCode: '920001.BJ',
      eventDate: '',
      announcementDate: null,
      effectiveDate: null,
      statusDate: '2026-09-30',
    });
  });

  it('projects every matching event and alias, including scalar paths, without loading market rows', async () => {
    const fetchedAt = new Date('2026-10-06T00:00:00Z');
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          fetchedAt,
          retryAt: new Date(Date.now() + 3600000),
          error: null,
          paths0: JSON.stringify(['$[0].ts_code', '$[2].ts_code']),
          paths1: '$[1].ts_code',
        },
      ])
      .mockResolvedValueOnce([
        {
          rows: [
            { ts_code: '920001.BJ', ann_date: '20260901' },
            { ts_code: '920001.BJ', ann_date: '20260920' },
            { ts_code: '830001.BJ', ann_date: '20260801' },
            { ts_code: '000001.SZ' },
          ],
        },
      ]);
    const manager = { findOneBy: jest.fn() };
    const request = jest.fn();
    const service = new BasicSnapshotService(
      { query, manager } as any,
      { queryData: request } as any,
      {} as any,
    );
    const result = await service.read(
      'stk_holdertrade',
      {},
      undefined,
      ['920001.BJ', '830001.BJ'],
      true,
    );
    expect(result.rows).toHaveLength(3);
    expect(result.state).toBe('ready');
    expect(manager.findOneBy).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(query.mock.calls[1][1]).toEqual([
      '$[0]',
      '$[2]',
      '$[1]',
      expect.any(String),
      fetchedAt,
    ]);
  });

  it('retries a projection when its snapshot changes and exposes retry cooldowns', async () => {
    const first = {
      fetchedAt: new Date('2026-10-05'),
      retryAt: new Date(Date.now() + 3600000),
      error: '暂不可用',
      paths0: '$[0].ts_code',
    };
    const second = {
      ...first,
      fetchedAt: new Date('2026-10-06'),
      paths0: '$[1].ts_code',
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([second])
      .mockResolvedValueOnce([
        { rows: { ts_code: '000010.SZ', ann_date: '20260930' } },
      ]);
    const service = new BasicSnapshotService(
      { query } as any,
      {} as any,
      {} as any,
    );
    const result = await service.read('st', {}, undefined, ['000010.SZ'], true);
    expect(result.rows).toEqual([
      { ts_code: '000010.SZ', ann_date: '20260930' },
    ]);
    expect(result.state).toBe('stale');
    expect(result.nextRetryAt).toBe(second.retryAt.toISOString());
    expect(query).toHaveBeenCalledTimes(4);
  });
});
