import { InsightService } from './insight.service';
import { StockInsightEntity, ThsHotEntity } from './insight.entity';
import { SyncRunEntity } from '../daily-task/sync-run.entity';

describe('InsightService observation boundaries', () => {
  const days = ['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-25'];
  function setup() {
    const db: any = {
      manager: {
        find: jest.fn().mockResolvedValue([]),
        findOneBy: jest.fn().mockResolvedValue(null),
      },
      query: jest.fn().mockResolvedValue([]),
    };
    const sectors: any = { snapshots: jest.fn().mockResolvedValue([]) };
    const service = new InsightService(
      db,
      {} as any,
      {} as any,
      {} as any,
      sectors,
      {} as any,
    );
    jest.spyOn(service as any, 'calendar').mockResolvedValue(days);
    const records = new Map(
      days.map((date, i) => [
        date,
        {
          tradeDate: date,
          signals: {
            ready: ['volumeBreakout'],
            items: [{ code: '000001.SZ', keys: ['volumeBreakout'] }],
          },
          data: [
            {
              code: '000001.SZ',
              name: '样本',
              basis: '000001.SZ',
              close: 100 - i * 10,
              traded: true,
              periods: {},
            },
          ],
        },
      ]),
    );
    jest.spyOn(service as any, 'observations').mockResolvedValue(records);
    return { service, records, sectors, db };
  }
  it('uses exchange sessions through the chosen cutoff, not calendar days or future prices', async () => {
    const { service } = setup();
    const result = await service.performance(days[0], 'volumeBreakout', 20);
    expect(result.items[0].outcomes[1].state).toBe('未到期');
    const friday = result.items.find((r) => r.date === '2026-09-25');
    expect(friday.outcomes[1]).toMatchObject({
      date: '2026-09-28',
      value: 14.2857,
    });
    expect(result.summary[0]).toMatchObject({
      total: 4,
      sample: 3,
      pending: 1,
      missing: 0,
    });
    expect(result.summary[2]).toMatchObject({
      sample: 0,
      pending: 4,
      average: null,
    });
  });
  it('excludes missing records from means and marks historical sector gaps', async () => {
    const { service, records, sectors } = setup();
    records.delete('2026-09-28');
    const result = await service.performance(days[0], 'volumeBreakout', 20);
    expect(result.missingDates).toEqual(['2026-09-28']);
    expect(result.summary[0]).toMatchObject({
      total: 3,
      sample: 1,
      pending: 1,
      missing: 1,
    });
    sectors.snapshots.mockResolvedValue([
      { asOf: '2026-10-01', members: [{ code: '000001.SZ' }] },
    ]);
    const filtered = await service.performance(
      days[0],
      'volumeBreakout',
      20,
      '881001.TI',
    );
    expect(filtered.readyDays).toBe(0);
    expect(filtered.items).toEqual([]);
  });
  it('separates a non-trading endpoint from missing adjustment data without changing the horizon', async () => {
    const { service, records } = setup();
    records.get('2026-09-28')!.data = [];
    records.get('2026-09-29')!.data[0].close = null as any;
    const result = await service.performance(days[0], 'volumeBreakout', 20);
    expect(
      result.items.find((r) => r.date === '2026-09-25').outcomes[1],
    ).toEqual({
      date: '2026-09-28',
      value: null,
      state: '观察日无成交',
    });
    expect(result.summary[0]).toMatchObject({
      inactive: 1,
      missing: 2,
      sample: 0,
      pending: 1,
    });
  });
  it('projects only strategy signals and their future endpoints and rejects changed snapshots', async () => {
    const { service, db } = setup();
    (service as any).observations.mockRestore();
    jest.spyOn(service as any, 'revisions').mockResolvedValue([]);
    jest.spyOn(service as any, 'revision').mockReturnValue('valid');
    db.query
      .mockResolvedValueOnce([
        {
          tradeDate: '2026-09-28',
          revision: 'valid',
          codes: ['000001.SZ', '000002.SZ'],
          signals: {
            ready: ['volumeBreakout'],
            items: [{ code: '000002.SZ', keys: ['volumeBreakout'] }],
          },
        },
        {
          tradeDate: '2026-09-29',
          revision: 'valid',
          codes: ['000001.SZ', '000002.SZ'],
          signals: { ready: ['volumeBreakout'], items: [] },
        },
      ])
      .mockResolvedValueOnce([
        { items: { code: '000002.SZ', close: 10, traded: true } },
      ])
      .mockResolvedValueOnce([]);
    const records = await (service as any).observations(
      ['2026-09-28', '2026-09-29'],
      'volumeBreakout',
    );
    expect(records.get('2026-09-28').data).toEqual([
      { code: '000002.SZ', close: 10, traded: true },
    ]);
    expect(records.has('2026-09-29')).toBe(false);
    expect(db.query.mock.calls[1][1]).toEqual(['$[1]', '2026-09-28', 'valid']);
    expect(db.query.mock.calls[2][1]).toEqual(['$[1]', '2026-09-29', 'valid']);
  });
  it('invalidates stored insights after a source revision changes', async () => {
    const db: any = {
      manager: {
        find: jest
          .fn()
          .mockResolvedValue([{ tradeDate: days[0], revision: 'obsolete' }]),
      },
      query: jest.fn(),
    };
    const service = new InsightService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'revisions').mockResolvedValue([]);
    expect((await (service as any).snapshots(days)).size).toBe(0);
    expect(db.manager.find.mock.calls[0][0]).toBe(StockInsightEntity);
  });
  it('uses the immediately preceding trading session, never an older available snapshot', async () => {
    const { service, db } = setup();
    const stock = {
      code: '000001.SZ',
      name: '样本',
      rank: 1,
      time: '',
      hot: 100,
    };
    db.manager.find.mockImplementation(async (entity: any) => {
      if (entity === ThsHotEntity)
        return [
          { tradeDate: days[0], data: [stock] },
          { tradeDate: days[2], data: [stock] },
        ];
      if (entity === SyncRunEntity)
        return [{ tradeDate: days[0] }, { tradeDate: days[2] }];
      return [];
    });
    const result = await service.popularity(days[0]);
    expect(result.items[0]).toMatchObject({
      state: 'unknown',
      change: null,
      streak: 1,
      streakCapped: true,
    });
    expect(result.exited).toEqual([]);
  });
});

describe('historical hot-rank source gaps', () => {
  const dates = ['2020-09-30', '2020-09-29', '2020-09-28'];
  function setup(error = '数据源返回空快照', age = 0, days = dates) {
    const manager: any = {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockImplementation(async (entity: any) =>
        entity === SyncRunEntity
          ? [
              {
                tradeDate: dates[0],
                error,
                updatedAt: new Date(Date.now() - age),
              },
            ]
          : [],
      ),
    };
    const writes: any = { withLock: (action: any) => action(manager) };
    const service = new InsightService(
      { manager } as any,
      writes,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'calendar').mockResolvedValue(days);
    jest.spyOn(service as any, 'revisions').mockResolvedValue([]);
    const sync = jest.spyOn(service, 'syncHot').mockResolvedValue(undefined);
    return { service, sync };
  }
  it('continues other dates while retaining an empty-source date as incomplete', async () => {
    const { service, sync } = setup();
    const result = await service.batch(dates[2], dates[0], true);
    expect(result).toMatchObject({
      completed: dates.slice(1),
      remaining: 1,
      failures: [],
    });
    expect(sync.mock.calls.map((c) => c[1])).toEqual(dates.slice(1));
  });
  it('keeps an all-deferred job pending without requesting or fabricating a snapshot', async () => {
    const { service, sync } = setup('数据源返回空快照', 0, [dates[0]]);
    const result = await service.batch(dates[0], dates[0], true);
    expect(sync).not.toHaveBeenCalled();
    expect(result?.completed).toEqual([]);
    expect(result?.remaining).toBe(1);
    expect(result?.failures[0]).toContain('24小时后重试');
  });
  it.each([
    ['数据源返回空快照', 24 * 60 * 60 * 1000],
    ['network timeout', 0],
  ])(
    'retries an expired gap or a different failure: %s',
    async (error, age) => {
      const { service, sync } = setup(error, age, [dates[0]]);
      const result = await service.batch(dates[0], dates[0], true);
      expect(sync).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        completed: [dates[0]],
        remaining: 0,
        failures: [],
      });
    },
  );
});
