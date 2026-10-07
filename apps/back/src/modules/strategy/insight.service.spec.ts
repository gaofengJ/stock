import { deflateSync } from 'zlib';
import { TREND_DEFAULTS } from './trend-rules';
import { INSIGHT_VERSION } from './insight.utils';
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
    const updatedAt = new Date('2026-09-30');
    const packed = (value: unknown) =>
      Buffer.concat([
        Buffer.alloc(4),
        deflateSync(Buffer.from(JSON.stringify(value))),
      ]);
    db.query
      .mockResolvedValueOnce([
        {
          id: 1,
          updatedAt,
          tradeDate: '2026-09-28',
          revision: 'valid',
          codes: ['000001.SZ', '000002.SZ'],
          signals: {
            ready: ['volumeBreakout'],
            items: [{ code: '000002.SZ', keys: ['volumeBreakout'] }],
          },
        },
        {
          id: 2,
          updatedAt,
          tradeDate: '2026-09-29',
          revision: 'valid',
          codes: ['000001.SZ', '000002.SZ'],
          signals: { ready: ['volumeBreakout'], items: [] },
        },
      ])
      .mockResolvedValueOnce([
        ...[1, 2].map((id) => ({
          id,
          updatedAt,
          revision: 'valid',
          packed: packed(['000001.SZ', '000002.SZ']),
        })),
      ])
      .mockResolvedValueOnce([
        {
          id: 1,
          updatedAt,
          revision: 'valid',
          packed: packed({ code: '000002.SZ', close: 10, traded: true }),
        },
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
    expect(db.query.mock.calls[1][1]).toEqual(['$[*].code', [1, 2]]);
    expect(db.query.mock.calls[2][1]).toEqual(['$[1]', [1]]);
    expect(db.query.mock.calls[3][1]).toEqual(['$[1]', [2]]);
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
  it('comparison reads only candidate industries and preserves percentage-point returns', async () => {
    const { service, sectors, db } = setup();
    const calendar = Array.from({ length: 61 }, (_, i) => `day-${i}`);
    (service as any).calendar.mockResolvedValue(calendar);
    jest.spyOn(service as any, 'snapshots').mockResolvedValue(
      new Map([
        [
          'day-0',
          {
            signals: { version: 'v1', items: [] },
            data: [
              {
                code: '000001.SZ',
                name: '目标',
                periods: { 20: { change: 40 }, 60: { change: 100 } },
              },
              { code: '000002.SZ', periods: {} },
            ],
          },
        ],
      ]),
    );
    jest.spyOn(service, 'popularity').mockResolvedValue({ items: [] } as any);
    sectors.snapshots.mockResolvedValue([
      { tsCode: '881001.TI', asOf: 'day-0', members: [{ code: '000001.SZ' }] },
      { tsCode: '881002.TI', asOf: 'day-0', members: [{ code: '000002.SZ' }] },
    ]);
    db.query.mockResolvedValue([
      { tsCode: '881001.TI', tradeDate: 'day-0', close: 10 },
      { tsCode: '881001.TI', tradeDate: 'day-20', close: 8 },
      { tsCode: '881001.TI', tradeDate: 'day-60', close: null },
    ]);
    const result = await service.comparison('day-0', ['000001.SZ']);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].relative).toEqual({ 20: 15, 60: null });
    expect(db.query.mock.calls[0][1]).toEqual([
      ['881001.TI'],
      ['day-0', 'day-20', 'day-60'],
    ]);
  });
  it('uses standard signals only when parameters, source and identity versions are current', async () => {
    const { service, db } = setup();
    const snapshot = {
      updatedAt: new Date('2026-09-30'),
      revision: 'valid',
      signals: {
        version: INSIGHT_VERSION,
        ready: ['fiveMaUp'],
        parameters: Object.fromEntries(
          Object.entries(TREND_DEFAULTS).reverse(),
        ),
        items: [{ code: '000001.SZ', keys: ['fiveMaUp'] }],
      },
    };
    db.manager.findOne = jest.fn().mockResolvedValue(snapshot);
    jest.spyOn(service as any, 'revisions').mockResolvedValue([]);
    jest.spyOn(service as any, 'revision').mockReturnValue('valid');
    expect(
      await service.standardCandidates(days[0], 'fiveMaUp', {
        ...TREND_DEFAULTS,
        fiveMaMode: 'current',
      }),
    ).toBeUndefined();
    expect(db.manager.findOne).not.toHaveBeenCalled();
    expect(
      await service.standardCandidates(days[0], 'fiveMaUp', TREND_DEFAULTS),
    ).toEqual(['000001.SZ']);
    db.query.mockResolvedValueOnce([{ id: 1 }]);
    expect(
      await service.standardCandidates(days[0], 'fiveMaUp', TREND_DEFAULTS),
    ).toBeUndefined();
    snapshot.revision = 'old';
    expect(
      await service.standardCandidates(days[0], 'fiveMaUp', TREND_DEFAULTS),
    ).toBeUndefined();
    snapshot.revision = 'valid';
    snapshot.signals.ready = [];
    expect(
      await service.standardCandidates(days[0], 'fiveMaUp', TREND_DEFAULTS),
    ).toBeUndefined();
  });
  it('uses standard >5% signals only as a superset for stricter turnover filters', async () => {
    const { service, db } = setup();
    db.manager.findOne = jest.fn().mockResolvedValue({
      updatedAt: new Date('2026-09-30'),
      revision: 'valid',
      signals: {
        version: INSIGHT_VERSION,
        ready: ['volumeBreakout'],
        parameters: TREND_DEFAULTS,
        items: [{ code: '000001.SZ', keys: ['volumeBreakout'] }],
      },
    });
    jest.spyOn(service as any, 'revisions').mockResolvedValue([]);
    jest.spyOn(service as any, 'revision').mockReturnValue('valid');
    expect(
      await service.standardCandidates(days[0], 'volumeBreakout', {
        ...TREND_DEFAULTS,
        minTurnoverRateF: 3,
      }),
    ).toBeUndefined();
    expect(db.manager.findOne).not.toHaveBeenCalled();
    expect(
      await service.standardCandidates(days[0], 'volumeBreakout', {
        ...TREND_DEFAULTS,
        minTurnoverRateF: 10,
      }),
    ).toEqual(['000001.SZ']);
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
  function setup(
    error = '数据源返回空快照',
    age = 0,
    days = dates,
    ignored = false,
  ) {
    const manager: any = {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockImplementation(async (entity: any, options: any) =>
        entity === SyncRunEntity &&
        (options.where.status === 'failed' || ignored)
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
    return { service, sync, manager };
  }
  it('skips only the waived popularity date and continues the other dates', async () => {
    const { service, sync } = setup('用户确认无需补齐', 0, dates, true);
    const result = await service.batch(dates[2], dates[0], true);
    expect(sync.mock.calls.map((c) => c[1])).toEqual(dates.slice(1));
    expect(result).toMatchObject({
      remaining: 0,
      failures: [],
      completed: dates.slice(1),
    });
    expect(result?.stage).toContain(`已忽略 ${dates[0]}`);
    expect(result?.retryAt).toBeUndefined();
  });
  it('an explicit hot-date fetch respects the waiver without overwriting its audit state', async () => {
    const { service, sync, manager } = setup();
    sync.mockRestore();
    manager.findOneBy = jest.fn().mockResolvedValue({ status: 'skipped' });
    await service.syncHot(manager, dates[0]);
    expect(manager.findOneBy).toHaveBeenCalledWith(SyncRunEntity, {
      task: 'ths-hot',
      tradeDate: dates[0],
      status: 'skipped',
    });
    expect(manager.query).not.toHaveBeenCalled();
  });
  it('a popularity waiver never removes the day from stock insight processing', async () => {
    const { service } = setup('用户确认无需补齐', 0, dates, true);
    const build = jest
      .spyOn(service as any, 'buildDay')
      .mockResolvedValue(undefined);
    const result = await service.batch(dates[2], dates[0], false);
    expect(build.mock.calls.map((c) => c[1])).toEqual(dates);
    expect(result?.completed).toEqual(dates);
  });
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
    expect(result?.failures).toEqual([]);
    expect(result?.waitingReason).toContain('源端冷却');
    expect(result?.retryAt?.getTime()).toBeGreaterThan(
      Date.now() + 23 * 60 * 60 * 1000,
    );
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

  it('other completed dates leave a source gap waiting until its original expiry', async () => {
    const { service, sync } = setup('数据源返回空快照', 12 * 60 * 60 * 1000);
    const result = await service.batch(dates[2], dates[0], true);
    expect(result).toMatchObject({
      completed: dates.slice(1),
      remaining: 1,
      failures: [],
    });
    expect(result?.retryAt?.getTime()).toBeGreaterThan(
      Date.now() + 11 * 60 * 60 * 1000,
    );
    expect(result?.retryAt?.getTime()).toBeLessThanOrEqual(
      Date.now() + 12 * 60 * 60 * 1000,
    );
    expect(sync).toHaveBeenCalledTimes(2);
  });

  it('a real failure beside a deferred gap still consumes a normal retry', async () => {
    const { service, sync } = setup();
    sync.mockRejectedValue(new Error('network timeout'));
    const result = await service.batch(dates[2], dates[0], true);
    expect(result?.failures).toHaveLength(2);
    expect(result?.retryAt).toBeUndefined();
  });

  it('remaining actionable dates continue in batches before entering source cooldown', async () => {
    const other = ['2020-09-25', '2020-09-24'];
    const { service } = setup('数据源返回空快照', 0, [...dates, ...other]);
    const result = await service.batch(other[1], dates[0], true);
    expect(result).toMatchObject({
      completed: [...dates.slice(1), other[0]],
      remaining: 2,
      failures: [],
    });
    expect(result?.retryAt).toBeUndefined();
  });
});
