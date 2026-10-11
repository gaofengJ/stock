import { TrendService } from './trend.service';

describe('stock chart quote contract', () => {
  it('returns real quote fields independently of the opening list, preserves gaps and aliases', async () => {
    const db: any = {
      manager: {
        find: jest
          .fn()
          .mockResolvedValue([{ oldCode: '830001.BJ', newCode: '920001.BJ' }]),
      },
      query: jest.fn().mockResolvedValue([
        {
          date: '2026-09-08',
          code: '830001.BJ',
          open: '10',
          close: '11',
          high: '12',
          low: '9',
          vol: '100',
          preClose: '10',
          pctChg: '10',
          amount: '500',
          turnoverRateF: '2.5',
          totalShare: '10000',
        },
        {
          date: '2026-09-09',
          code: '920001.BJ',
          open: '11',
          close: '11',
          high: '11',
          low: '11',
          vol: '0',
          preClose: '11',
          pctChg: '0',
          amount: '0',
          turnoverRateF: null,
        },
      ]),
    };
    const service = new TrendService(db, null as any, null as any, null as any);
    jest
      .spyOn(service as any, 'calendar')
      .mockResolvedValue(['2026-09-08', '2026-09-09', '2026-09-10']);
    const result = await service.chart({
      date: '2026-09-10',
      code: '830001.BJ',
      strategyType: 'threeDaysHighVol',
    } as any);
    expect(result.code).toBe('920001.BJ');
    expect(result.series[0].quote).toMatchObject({
      preClose: 10,
      amount: 500,
      turnoverRateF: 2.5,
      turnoverRateTotal: 0.01,
      pctChg: 10,
    });
    expect(result.series[1]).toMatchObject({
      close: null,
      quote: { vol: 0, turnoverRateF: null },
    });
    expect(result.series[2]).toMatchObject({ close: null, quote: null });
    expect(db.query.mock.calls[0][1][0]).toEqual(['920001.BJ', '830001.BJ']);
    expect(db.query.mock.calls[0][0]).toContain('d.total_share totalShare');
  });

  it.each([
    ['20000', '10000', 2],
    ['0', '10000', 0],
    ['20000', null, null],
    ['20000', '', null],
    ['20000', '0', null],
    ['20000', '-1', null],
    ['20000', 'invalid', null],
    [null, '10000', null],
    ['invalid', '10000', null],
    ['-1', '10000', null],
  ])(
    'uses the daily total capital and handles missing values: %s / %s',
    async (vol, totalShare, expected) => {
      const db: any = {
        manager: { find: jest.fn().mockResolvedValue([]) },
        query: jest.fn().mockResolvedValue([
          {
            date: '2026-09-08',
            code: '000001.SZ',
            open: 10,
            close: 10,
            high: 10,
            low: 10,
            vol,
            totalShare,
            turnoverRateF: 88,
          },
        ]),
      };
      const service = new TrendService(
        db,
        null as any,
        null as any,
        null as any,
      );
      jest.spyOn(service as any, 'calendar').mockResolvedValue(['2026-09-08']);
      const result = await service.chart({
        date: '2026-09-08',
        code: '000001.SZ',
        strategyType: 'threeDaysHighVol',
      } as any);
      expect(result.series[0].quote?.turnoverRateTotal).toBe(expected);
    },
  );
});
