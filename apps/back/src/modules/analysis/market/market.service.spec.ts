import { DataSource } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { ACCESS } from '@/modules/auth/permissions';
import { MarketService } from './market.service';
import { MarketController } from './market.controller';

describe('Market status date-specific update times', () => {
  it('preserves each published date timestamp instead of applying the latest one to history', async () => {
    const rows = [
      { date: '2026-09-24', updatedAt: new Date('2026-09-27T14:25:00Z') },
      { date: '2024-09-24', updatedAt: new Date('2026-09-26T10:00:00Z') },
    ];
    const db = {
      query: jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]),
      manager: {
        findOne: jest.fn().mockResolvedValue({ calDate: '2026-09-24' }),
        findBy: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new MarketService(
      db as unknown as DataSource,
      {} as TushareService,
    );
    const status = await service.status();
    expect(status.latestDate).toBe('2026-09-24');
    expect(status.dates).toEqual(['2026-09-24', '2024-09-24']);
    expect(status.dateUpdates).toEqual({
      '2026-09-24': '2026-09-27T14:25:00.000Z',
      '2024-09-24': '2026-09-26T10:00:00.000Z',
    });
    expect(status.dateUpdates['2025-01-01']).toBeUndefined();
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('returns no date timestamp before the first completed publication', async () => {
    const db = {
      query: jest.fn().mockResolvedValue([]),
      manager: { findOne: jest.fn().mockResolvedValue(null) },
    };
    const status = await new MarketService(
      db as unknown as DataSource,
      {} as TushareService,
    ).status();
    expect(status.latestDate).toBeNull();
    expect(status.dateUpdates).toEqual({});
  });
});

describe('daily dragon list availability', () => {
  const reply = (items: string[][]) => ({
    code: 0,
    data: { fields: ['ts_code', 'trade_date'], items },
  });
  const setup = () => {
    const queryData = jest.fn();
    const service = new MarketService(
      {} as DataSource,
      {
        queryData,
      } as unknown as TushareService,
    );
    return { service, queryData };
  };
  afterEach(() => jest.useRealTimers());

  it('deduplicates multiple listing reasons and merges concurrent date requests', async () => {
    const { service, queryData } = setup();
    queryData.mockResolvedValue(
      reply([
        ['600825.SH', '20260930'],
        ['600825.SH', '20260930'],
        ['000678.SZ', '20260930'],
      ]),
    );
    const results = await Promise.all([
      service.dragonList('2026-09-30'),
      service.dragonList('2026-09-30'),
    ]);
    expect(results[0].codes).toEqual(['600825.SH', '000678.SZ']);
    expect(results[1]).toEqual(results[0]);
    await service.dragonList('2026-09-30');
    expect(queryData).toHaveBeenCalledTimes(1);
    expect(queryData).toHaveBeenCalledWith(
      'top_list',
      {
        trade_date: '20260930',
      },
      undefined,
      10000,
      7000,
    );
  });

  it('keeps different dates separate and rejects missing or invalid request dates', async () => {
    const { service, queryData } = setup();
    queryData.mockImplementation((_api, params) =>
      reply([
        [
          params.trade_date === '20260930' ? '600825.SH' : '000678.SZ',
          params.trade_date,
        ],
      ]),
    );
    expect((await service.dragonList('2026-09-30')).codes).toEqual([
      '600825.SH',
    ]);
    expect((await service.dragonList('2026-09-29')).codes).toEqual([
      '000678.SZ',
    ]);
    await expect(service.dragonList('')).rejects.toThrow('请选择交易日');
    await expect(service.dragonList('invalid')).rejects.toThrow();
    expect(queryData).toHaveBeenCalledTimes(2);
  });

  it('does not turn upstream failures into an empty list and retries after failure', async () => {
    const { service, queryData } = setup();
    queryData
      .mockRejectedValueOnce(new Error('source failure'))
      .mockResolvedValue(reply([]));
    await expect(service.dragonList('2026-09-30')).rejects.toThrow(
      'source failure',
    );
    expect((await service.dragonList('2026-09-30')).codes).toEqual([]);
    expect(queryData).toHaveBeenCalledTimes(2);
  });

  it('rejects unrelated dates and malformed stock codes instead of caching incorrect availability', async () => {
    const { service, queryData } = setup();
    queryData
      .mockResolvedValueOnce(reply([['600825.SH', '20260929']]))
      .mockResolvedValueOnce(reply([['not-a-stock', '20260930']]))
      .mockResolvedValue(reply([['899050.BJ', '2026-09-30']]));
    await expect(service.dragonList('2026-09-30')).rejects.toThrow(
      '龙虎榜交易日期不匹配',
    );
    await expect(service.dragonList('2026-09-30')).rejects.toThrow(
      '龙虎榜股票代码异常',
    );
    expect((await service.dragonList('2026-09-30')).codes).toEqual([
      '899050.BJ',
    ]);
  });

  it('expires empty lists quickly so newly published listings can appear', async () => {
    jest.useFakeTimers();
    const { service, queryData } = setup();
    queryData
      .mockResolvedValueOnce(reply([]))
      .mockResolvedValue(reply([['600825.SH', '20260930']]));
    expect((await service.dragonList('2026-09-30')).codes).toEqual([]);
    await jest.advanceTimersByTimeAsync(61000);
    expect((await service.dragonList('2026-09-30')).codes).toEqual([
      '600825.SH',
    ]);
  });

  it('uses the same permission as limit review details', () => {
    expect(
      Reflect.getMetadata(ACCESS, MarketController.prototype.dragonList),
    ).toEqual({ any: ['analysis:limits'] });
  });

  it('shares the full snapshot with the board and keeps overlapping reasons separate', async () => {
    const { service, queryData } = setup();
    queryData.mockResolvedValue({
      code: 0,
      data: {
        fields: [
          'ts_code',
          'trade_date',
          'name',
          'reason',
          'net_amount',
          'close',
        ],
        items: [
          ['600825.SH', '20260930', '新华传媒', '单日涨幅', 100000, 10.35],
          ['600825.SH', '20260930', '新华传媒', '三日涨幅', 200000, 10.35],
          ['300750.SZ', '20260930', '宁德时代', '单日涨幅', -300000, null],
        ],
      },
    });
    await service.dragonList('2026-09-30');
    const main = await service.dragonBoard({
      date: '2026-09-30',
      scope: 'main',
      days: 20,
      type: 'U',
    });
    expect(main.items.map((r) => r.netAmount)).toEqual([100000, 200000]);
    const gem = await service.dragonBoard({
      date: '2026-09-30',
      scope: 'gem',
      days: 20,
      type: 'U',
    });
    expect(gem.items).toHaveLength(1);
    expect(gem.items[0].close).toBeNull();
    expect(queryData).toHaveBeenCalledTimes(1);
    queryData.mockResolvedValue(reply([]));
    const detail = await service.dragon('2026-09-30', '600825.SH');
    expect(detail.summary.map((r) => r.netAmount)).toEqual([100000, 200000]);
    expect(queryData).toHaveBeenLastCalledWith(
      'top_inst',
      { trade_date: '20260930', ts_code: '600825.SH' },
      undefined,
      10000,
      7000,
    );
    await service.dragon('2026-09-30', '600825.SH');
    expect(queryData).toHaveBeenCalledTimes(2);
  });

  it('protects the standalone board and permits existing detail access', () => {
    expect(
      Reflect.getMetadata(ACCESS, MarketController.prototype.dragonBoard),
    ).toEqual({ any: ['analysis:dragon'] });
    expect(
      Reflect.getMetadata(ACCESS, MarketController.prototype.dragon),
    ).toEqual({ any: ['analysis:limits', 'analysis:dragon'] });
  });
});
