import { SentiService } from './senti.service';

describe('published sentiment analysis', () => {
  function fixture() {
    const tradeCal = {
      list: jest.fn().mockResolvedValue({
        items: [
          { calDate: '2024-07-01', preTradeDate: '2024-06-28' },
          { calDate: '2024-07-02', preTradeDate: '2024-07-01' },
        ],
      }),
    };
    const daily = {
      getDistributionStatistics: jest.fn().mockResolvedValue(Array(21).fill(9)),
      upDownCount: jest.fn().mockResolvedValue([]),
    };
    const limits = {
      limitUpDownCount: jest.fn().mockResolvedValue([]),
      limitUpMaxTimesCount: jest.fn().mockResolvedValue([]),
    };
    const processed = { list: jest.fn().mockResolvedValue([]) };
    const db = {
      query: jest.fn().mockResolvedValue([
        { date: '2024-06-28', state: 'ready' },
        { date: '2024-07-01', state: 'ready' },
        { date: '2024-07-02', state: 'protected' },
      ]),
    };
    return {
      processed,
      db,
      service: new SentiService(
        tradeCal as any,
        daily as any,
        limits as any,
        processed as any,
        db as any,
      ),
    };
  }

  it('hides residual distribution values on a protected day', async () => {
    const { service } = fixture();
    const rows = await service.distributionTatistics('2024-07-02');
    expect(rows).toHaveLength(21);
    expect(
      rows.every((row) => row.count === null && row.state === 'protected'),
    ).toBe(true);
  });

  it.each([
    ['upDownCount', ['upCount', 'flatCount', 'downCount']],
    ['limitUpDownCount', ['limitUCount', 'limitDCount', 'limitZCount']],
    ['limitUpMaxTimesCount', ['maxLimitTimes']],
  ] as const)(
    '%s returns null for protected days and preserves real zeroes',
    async (method, fields) => {
      const { service, db } = fixture();
      const rows = await service[method]({
        startDate: '2024-07-01',
        endDate: '2024-07-02',
      });
      fields.forEach((field) => {
        expect((rows[0] as Record<string, unknown>)[field]).toBe(0);
        expect((rows[1] as Record<string, unknown>)[field]).toBeNull();
      });
      expect(rows[1].state).toBe('protected');
      expect(db.query).toHaveBeenCalledTimes(1);
    },
  );

  it('does not fabricate processed sentiment when raw data alone is ready', async () => {
    const { service } = fixture();
    const rows = await service.list({
      startDate: '2024-07-01',
      endDate: '2024-07-02',
    });
    expect(rows[0]).toMatchObject({
      tradeDate: '2024-07-01',
      state: 'missing',
      sentiA: null,
      a: null,
    });
    expect(rows[1]).toMatchObject({
      tradeDate: '2024-07-02',
      state: 'protected',
      sentiD: null,
    });
  });

  it('requires prior raw quotes without requiring a prior processed sentiment row', async () => {
    const { service, processed, db } = fixture();
    db.query.mockResolvedValue([
      { date: '2024-06-28', state: 'ready' },
      { date: '2024-07-01', state: 'ready' },
      { date: '2024-07-02', state: 'ready' },
    ]);
    processed.list.mockResolvedValue([
      {
        tradeDate: '2024-07-02',
        a: 0,
        b: 0,
        c: 0,
        d: 0,
        e: 0,
        sentiA: '0',
        sentiB: '0',
        sentiC: '0',
        sentiD: '0',
      },
    ]);
    const rows = await service.list({
      startDate: '2024-07-01',
      endDate: '2024-07-02',
    });
    expect(rows[0].state).toBe('missing');
    expect(rows[1]).toMatchObject({
      tradeDate: '2024-07-02',
      state: 'ready',
      a: 0,
      sentiA: '0',
    });
  });
});
