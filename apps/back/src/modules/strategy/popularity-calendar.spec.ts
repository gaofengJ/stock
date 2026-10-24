import { InsightService } from './insight.service';
import { ThsHotEntity } from './insight.entity';
import { SyncRunEntity } from '../daily-task/sync-run.entity';

describe('popularity uses actual daily editions, including weekends', () => {
  const dates = ['2026-10-19', '2026-10-18', '2026-10-17', '2026-10-16'];
  const stocks = (offset = 0) =>
    Array.from({ length: 100 }, (_, i) => ({
      code: `${String(i + 1).padStart(6, '0')}.SZ`,
      name: '样本',
      rank: ((i + offset) % 100) + 1,
      hot: 100,
      time: '',
    }));
  function setup(editions = dates, incomplete = false) {
    const rows = editions.map((tradeDate, i) => ({
      tradeDate,
      data: incomplete && i === 1 ? stocks(i).slice(1) : stocks(i),
      rankTime: `${tradeDate} 22:30:00`,
    }));
    const manager: any = {
      query: jest.fn().mockResolvedValue([]),
      find: jest.fn().mockImplementation(async (entity) => {
        if (entity === ThsHotEntity) return rows;
        if (entity === SyncRunEntity)
          return rows.map((r) => ({ tradeDate: r.tradeDate }));
        return [];
      }),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    const db: any = { manager, query: jest.fn().mockResolvedValue([]) };
    const writes: any = {
      withLock: (action: (m: any) => unknown) => action(manager),
    };
    const service = new InsightService(
      db,
      writes,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service as any, 'hotDates').mockResolvedValue(editions);
    const calendar = jest
      .spyOn(service as any, 'calendar')
      .mockResolvedValue(['2026-10-16']);
    return { service, manager, calendar };
  }
  it('Monday compares Sunday, and the history contains both weekend editions', async () => {
    const { service } = setup();
    const result = await service.popularity(dates[0], true, '000001.SZ');
    expect(result).toMatchObject({
      previousDate: dates[1],
      previousReady: true,
      complete: true,
    });
    expect(result.items[0]).toMatchObject({
      change: 1,
      previousRank: 2,
      streak: 4,
    });
    expect(result.items[0].history.map((r) => r.date)).toEqual(
      [...dates].reverse(),
    );
    const saturday = await service.popularity(dates[2]);
    expect(saturday.previousDate).toBe(dates[3]);
    expect(saturday.marketDate).toBe('2026-10-16');
  });
  it('missing editions compare the preceding actual date; explicit missing dates stay empty', async () => {
    const { service } = setup([dates[0], dates[2], dates[3]]);
    expect((await service.popularity(dates[0])).previousDate).toBe(dates[2]);
    expect(await service.popularity(dates[1])).toMatchObject({
      date: dates[1],
      ready: false,
      items: [],
    });
    expect(
      await service.popularity('2026-10-24', true, undefined, true),
    ).toMatchObject({ date: dates[0], ready: true });
  });
  it('an incomplete previous edition does not turn a missing stock into a new entry', async () => {
    const { service } = setup(dates, true);
    const result = await service.popularity(dates[0]);
    expect(result.previousReady).toBe(false);
    expect(result.items[0]).toMatchObject({
      state: 'unknown',
      change: null,
      streak: 1,
      streakCapped: true,
    });
    expect(result.items[1].change).toBe(1);
  });
  it('backfill includes Saturday and Sunday without using the trading calendar', async () => {
    const { service, manager, calendar } = setup();
    manager.find.mockResolvedValue([]);
    const sync = jest.spyOn(service, 'syncHot').mockResolvedValue(undefined);
    const result = await service.batch(dates[2], dates[0], true);
    expect(sync.mock.calls.map((c) => c[1])).toEqual(dates.slice(0, 3));
    expect(calendar).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      completed: dates.slice(0, 3),
      remaining: 0,
    });
  });
  it('weekend scheduling advances the popularity range while keeping insight dates on trading days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-18T14:40:00Z'));
    try {
      const { service, manager } = setup();
      manager.query.mockImplementation(async (sql: string) =>
        sql.includes('MAX(trade_date)') ? [{ date: dates[3] }] : [],
      );
      await service.enqueueEvening();
      const inserts = manager.query.mock.calls.filter((c: any[]) =>
        c[0].startsWith('INSERT INTO t_admin_job'),
      );
      expect(inserts.find((c: any[]) => c[1][4] === 'hot')[1][2]).toBe(
        dates[1],
      );
      expect(inserts.find((c: any[]) => c[1][4] === 'insights')[1][2]).toBe(
        dates[3],
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
