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
