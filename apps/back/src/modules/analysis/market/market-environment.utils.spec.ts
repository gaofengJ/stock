import {
  marketBreadth,
  priorAmountMean,
  BreadthFactor,
} from './market-environment.utils';

describe('市场环境统计', () => {
  const factor = (
    tsCode: string,
    closeHfq: unknown,
    maHfq20: unknown,
    maHfq60: unknown,
  ): BreadthFactor => ({ tsCode, closeHfq, maHfq20, maHfq60 });
  const cutoffs = { ma20: '2026-09-01', ma60: '2026-07-01' };

  it('使用同口径价格严格高于SMA，平于均线不计入；含ST但排除无成交', () => {
    const codes = ['600000.SH', '000001.SZ', '300001.SZ', '688001.SH'];
    const result = marketBreadth(
      codes.map((tsCode, i) => ({ tsCode, amount: i === 3 ? 0 : 100 })),
      [
        factor(codes[0], 22, 20, 23),
        factor(codes[1], 10, 10, 9),
        factor(codes[2], 9, 10, 9),
        factor(codes[3], 100, 10, 10),
      ],
      'all',
      new Map(),
      cutoffs,
    );
    expect(result.total).toBe(3);
    expect(result.ma20).toMatchObject({
      above: 1,
      eligible: 3,
      missing: 0,
      insufficient: 0,
    });
    expect(result.ma60).toMatchObject({ above: 1, eligible: 3 });
    expect(result.ma20.ratio).toBeCloseTo(100 / 3);
  });

  it('分别披露均线不足和缺因子，分母按周期独立，不把无样本算成零', () => {
    const daily = ['600001.SH', '600002.SH', '600003.SH', '600004.SH'].map(
      (tsCode) => ({ tsCode, amount: 100 }),
    );
    const dates = new Map([
      ['600001.SH', '2026-09-15'],
      ['600002.SH', '2026-08-01'],
    ]);
    const factors = [
      factor('600001.SH', 30, 10, 10),
      factor('600002.SH', 30, 10, 10),
      factor('600003.SH', 30, null, NaN),
    ];
    const result = marketBreadth(daily, factors, 'hs', dates, cutoffs);
    expect(result.ma20).toEqual({
      above: 1,
      eligible: 1,
      insufficient: 2,
      missing: 1,
      ratio: 100,
    });
    expect(result.ma60).toEqual({
      above: 0,
      eligible: 0,
      insufficient: 3,
      missing: 1,
      ratio: null,
    });
  });

  it('统计范围真实过滤，零占比与空市场区分', () => {
    const daily = ['600000.SH', '300000.SZ', '688000.SH', '920001.BJ'].map(
      (tsCode) => ({ tsCode, amount: 100 }),
    );
    const factors = daily.map((r) => factor(r.tsCode, 5, 10, 10));
    expect(
      marketBreadth(daily, factors, 'main', new Map(), cutoffs).ma20,
    ).toMatchObject({ eligible: 1, ratio: 0 });
    expect(marketBreadth(daily, factors, 'bj', new Map(), cutoffs).total).toBe(
      1,
    );
    expect(
      marketBreadth([], [], 'all', new Map(), cutoffs).ma20.ratio,
    ).toBeNull();
  });

  it('前5/20日均额排除当日，任何一个预期交易日缺失都不计算', () => {
    const dates = Array.from({ length: 20 }, (_, i) => `d${i}`);
    const amounts = new Map(dates.map((date, i) => [date, { amount: i * 10 }]));
    amounts.set('today', { amount: 1000000 });
    expect(priorAmountMean(dates, amounts, 5)).toBe(20);
    expect(priorAmountMean(dates, amounts, 20)).toBe(95);
    amounts.delete('d15');
    expect(priorAmountMean(dates, amounts, 5)).toBe(20);
    expect(priorAmountMean(dates, amounts, 20)).toBeNull();
    expect(priorAmountMean(dates.slice(0, 4), amounts, 5)).toBeNull();
    amounts.set('d2', { amount: NaN });
    expect(priorAmountMean(dates, amounts, 5)).toBeNull();
  });
});
