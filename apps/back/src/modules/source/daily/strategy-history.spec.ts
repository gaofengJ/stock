import { DailyService } from './daily.service';
import { DailyEntity } from './daily.entity';

describe('策略历史标记与原选股一致', () => {
  test('复用六种原判定，跨两个日期只查询一次日线，不把未来行情带入历史', async () => {
    const dates = [
      '2026-09-24',
      '2026-09-25',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
    ];
    const rows = dates.flatMap((tradeDate, i) =>
      ['600001.SH', '000001.SZ'].map((tsCode) =>
        Object.assign(new DailyEntity(), {
          tradeDate,
          tsCode,
          name: '普通股票',
          open: String(10 + i),
          close: String(10.7 + i),
          high: String(10.8 + i),
          low: String(9.9 + i),
          preClose: String(9.7 + i),
          amount: tsCode === '600001.SH' ? '60000' : '40000',
          volumeRatio: '3',
          turnoverRateF: '6',
          vol: '10000',
          upLimit: '30',
        }),
      ),
    );
    const repository = {
      find: jest
        .fn()
        .mockImplementation((q) =>
          rows.filter((r) => q.where.tradeDate.value.includes(r.tradeDate)),
        ),
    };
    const service = new DailyService(undefined!, repository as any);
    const history = await service.strategyHistory(dates, dates.slice(-2));
    expect(repository.find).toHaveBeenCalledTimes(1);
    expect(history[1].hits.size).toBeGreaterThan(0);
    const methods = {
      gapThreeUp: 'findGapThreeUp',
      gapTwoUp: 'findGapTwoUp',
      gapThreeHighTurnover: 'findGapThreeHighTurnover',
      threeDaysHighVol: 'findThreeDaysHighVol',
      continuousGap: 'findContinuousGap',
      shadowWrap: 'findShadowWrap',
    } as const;
    await Promise.all(
      history.map(async (result) => {
        const window = dates
          .filter((d) => d <= result.date)
          .slice(-4)
          .reverse();
        const outputs = await Promise.all(
          Object.entries(methods).map(async ([key, method]) => ({
            key,
            rows: await service[method](
              key === 'gapThreeUp' || key === 'gapThreeHighTurnover'
                ? window
                : window.slice(0, 3),
            ),
          })),
        );
        outputs.forEach(({ key, rows: selected }) => {
          expect(
            [...result.hits]
              .filter(([, keys]) => keys.includes(key))
              .map(([code]) => code)
              .sort(),
          ).toEqual(selected.map((r) => r.tsCode).sort());
        });
        expect(result.hits.has('000001.SZ')).toBe(false);
      }),
    );
  });
});
