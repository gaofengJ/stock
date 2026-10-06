import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StrategyListQueryDto } from './strategy.dto';
import {
  breakoutAt,
  evaluateTrend,
  pullbackAt,
  fiveMaAt,
  fiveMaState,
  requiredTrendDays,
  TrendPoint,
  normalizeTrendSeries,
} from './trend-rules';

const point = (i: number, close = 9, vol = 100): TrendPoint => ({
  date: String(i),
  open: close - 0.1,
  close,
  high: close + 1,
  low: close - 1,
  vol,
});
test('北交所换码的不同复权基准只按已验证比例衔接，未知比例不拼接', () => {
  const old = { ...point(0, 10), basis: '830001.BJ' };
  const current = { ...point(1, 20), basis: '920001.BJ', conversion: 2 };
  expect(normalizeTrendSeries([old, current], '920001.BJ', 2)?.[0]?.close).toBe(
    20,
  );
  expect(
    normalizeTrendSeries(
      [old, { ...current, conversion: undefined }],
      '920001.BJ',
      2,
    ),
  ).toBeNull();
  expect(
    normalizeTrendSeries(
      [old, { ...current, conversion: undefined }],
      '920001.BJ',
      1,
    )?.[0],
  ).toBeUndefined();
  expect(normalizeTrendSeries([old], '920001.BJ', 1)?.[0]?.close).toBe(10);
});
const breakout = () => [
  ...Array.from({ length: 20 }, (_, i) => point(i)),
  { ...point(20, 11, 150), high: 30 },
];
const pullback = () => [
  ...Array.from({ length: 20 }, (_, i) => point(i)),
  { ...point(20, 11, 200), high: 12 },
  { ...point(21, 10.6, 80), low: 10 },
  { ...point(22, 11, 90), open: 10.6, low: 10 },
];

describe('趋势策略：窗口、边界和缺失数据', () => {
  test.each([undefined, null, NaN, 0, 4.99, 5, 5.01])(
    '放量突破信号日换手率%s必须严格大于5%%',
    (turnoverRateF) => {
      const rows = breakout();
      rows[20].turnoverRateF = turnoverRateF;
      expect(evaluateTrend('volumeBreakout', rows) !== null).toBe(
        turnoverRateF === 5.01,
      );
    },
  );
  test('放量突破参考日不设换手率限制，回踩策略独立保持原条件', () => {
    const rows = breakout();
    rows.forEach((row) => {
      Object.assign(row, { turnoverRateF: 0 });
    });
    rows[20].turnoverRateF = 6;
    expect(evaluateTrend('volumeBreakout', rows)).not.toBeNull();
    expect(evaluateTrend('breakoutPullback', pullback())).not.toBeNull();
  });
  test('放量突破支持用户门槛，并始终使用严格大于', () => {
    const rows = breakout();
    rows[20].turnoverRateF = 3;
    expect(
      evaluateTrend('volumeBreakout', rows, { minTurnoverRateF: 2 }),
    ).not.toBeNull();
    expect(evaluateTrend('volumeBreakout', rows)).toBeNull();
    expect(
      evaluateTrend('volumeBreakout', rows, { minTurnoverRateF: 3 }),
    ).toBeNull();
  });
  test('突破基准排除当日最高价及成交量，正好1.5倍可以命中', () => {
    expect(breakoutAt(breakout(), 20)).toMatchObject({
      breakoutPrice: 10,
      volumeMultiple: 1.5,
    });
  });
  test('收盘等于历史高点不算突破，少于均量门槛不命中', () => {
    const rows = breakout();
    rows[20].close = 10;
    expect(breakoutAt(rows, 20)).toBeNull();
    rows[20].close = 11;
    rows[20].vol = 149.99;
    expect(breakoutAt(rows, 20)).toBeNull();
  });
  test('回看参数控制窗口，不读取未来行情', () => {
    const rows = breakout();
    rows[0].high = 100;
    expect(breakoutAt(rows, 20)).toBeNull();
    expect(
      breakoutAt([...rows, point(21, 999)], 20, { breakoutDays: 5 }),
    ).not.toBeNull();
  });
  test.each([undefined, 0, NaN])('历史均量 %s 不被替换为0', (vol) => {
    const rows = breakout();
    rows[19].vol = vol;
    expect(breakoutAt(rows, 20)).toBeNull();
  });
  test('缺一个交易日、突破日不符合共同条件都不能命中', () => {
    const rows: (TrendPoint | undefined)[] = breakout();
    rows[2] = undefined;
    expect(breakoutAt(rows, 20)).toBeNull();
    const valid = breakout();
    valid[20].eligible = false;
    expect(breakoutAt(valid, 20)).toBeNull();
  });
  test('价格整体按相同比例复权，判定和比例证据不变', () => {
    const rows = breakout();
    const scaled = rows.map((p) => ({
      ...p,
      open: p.open * 3.7,
      close: p.close * 3.7,
      high: p.high * 3.7,
      low: p.low * 3.7,
    }));
    expect(breakoutAt(scaled, 20)?.breakoutPct).toBeCloseTo(
      breakoutAt(rows, 20)!.breakoutPct!,
    );
  });
  test('回踩只统计中间日均量，不包含突破日或企稳日', () => {
    const rows = pullback();
    rows[22].vol = 10000;
    expect(pullbackAt(rows, 22)).toMatchObject({
      breakoutDate: '20',
      contractionRatio: 0.4,
      pullbackPct: 0,
    });
  });
  test('昨天才突破，还没有中间回踩日，不算回踩企稳', () => {
    expect(
      pullbackAt(
        pullback().filter((_, i) => i !== 21),
        21,
      ),
    ).toBeNull();
  });
  test('不回退到旧突破；最近一次突破位被跌破就排除', () => {
    const rows = pullback();
    rows[21] = { ...point(21, 14, 1000), high: 14.1 };
    rows[22] = { ...point(22, 14.2, 100), open: 14, low: 10 };
    expect(pullbackAt(rows, 22)).toBeNull();
  });
  test('突破后任何一天收盘跌破容差就排除，即使今天收回', () => {
    const rows = pullback();
    rows[21].close = 9.79;
    expect(pullbackAt(rows, 22)).toBeNull();
  });
  test('容差、缩量边界包含，超出边界排除', () => {
    const rows = pullback();
    rows[22].low = 9.8;
    rows[21].vol = 160;
    expect(pullbackAt(rows, 22)).not.toBeNull();
    rows[21].vol = 160.01;
    expect(pullbackAt(rows, 22)).toBeNull();
    rows[21].vol = 80;
    rows[22].low = 9.79;
    expect(pullbackAt(rows, 22)).toBeNull();
  });
  test('当前没有收阳或没有回升不算企稳', () => {
    const rows = pullback();
    rows[22].open = 11;
    expect(pullbackAt(rows, 22)).toBeNull();
    rows[22].open = 10;
    rows[22].close = 10.6;
    expect(pullbackAt(rows, 22)).toBeNull();
  });
  test('共同条件不满足的突破日不能作为回踩参照', () => {
    const rows = pullback();
    rows[20].eligible = false;
    expect(pullbackAt(rows, 22)).toBeNull();
  });
});

describe('五线顺上', () => {
  const rising = () =>
    Array.from({ length: 131 }, (_, i) => point(i, 10 + i * 0.1));
  test('持续多头不能重复当作新形成；当前满足会返回有界持续天数', () => {
    const rows = rising();
    expect(fiveMaAt(rows, 130)).toBeNull();
    expect(fiveMaAt(rows, 130, { fiveMaMode: 'current' })).toMatchObject({
      streak: 11,
      streakCapped: true,
    });
  });
  test('昨日不满足且今日五线均向上才属于新形成', () => {
    const rows = Array.from({ length: 122 }, (_, i) =>
      point(i, i === 121 ? 20 : 10),
    );
    expect(fiveMaAt(rows, 121)).toMatchObject({
      streak: 1,
      streakCapped: false,
    });
    expect(fiveMaAt(rows.slice(1), 120)).toBeNull();
  });
  test('MA5下行时，即使多头排列仍不能命中', () => {
    const rows = rising().slice(0, 122);
    rows[121] = point(121, rows[116].close - 0.01);
    const state = fiveMaState(rows, 121)!;
    expect(
      state.averages.every((v, i) => i === 4 || v > state.averages[i + 1]),
    ).toBe(true);
    expect(state.satisfied).toBe(false);
  });
  test('相等均线、不足120日、缺价都不能当作顺上', () => {
    expect(
      fiveMaAt(
        Array.from({ length: 122 }, (_, i) => point(i, 10)),
        121,
      ),
    ).toBeNull();
    expect(
      fiveMaAt(rising().slice(0, 120), 119, { fiveMaMode: 'current' }),
    ).toBeNull();
    const rows: (TrendPoint | undefined)[] = rising();
    rows[15] = undefined;
    expect(fiveMaAt(rows, 130, { fiveMaMode: 'current' })).toBeNull();
  });
  test('可选收阳、站上MA5、放量门槛独立生效', () => {
    const rows = rising();
    rows[130].open = rows[130].close;
    expect(fiveMaAt(rows, 130, { fiveMaMode: 'current' })).not.toBeNull();
    expect(
      fiveMaAt(rows, 130, { fiveMaMode: 'current', bullish: true }),
    ).toBeNull();
    expect(
      fiveMaAt(rows, 130, { fiveMaMode: 'current', aboveMa5: true }),
    ).not.toBeNull();
    expect(
      fiveMaAt(rows, 130, { fiveMaMode: 'current', expandingVolume: true }),
    ).toBeNull();
    rows[130].vol = 150;
    expect(
      fiveMaAt(rows, 130, { fiveMaMode: 'current', expandingVolume: true }),
    ).not.toBeNull();
  });
  test('窗口包含均线比较所需额外交易日和回踩之前的突破基准', () => {
    expect(requiredTrendDays('fiveMaUp')).toBe(122);
    expect(requiredTrendDays('fiveMaUp', { fiveMaMode: 'current' })).toBe(121);
    expect(requiredTrendDays('breakoutPullback')).toBe(31);
    expect(requiredTrendDays('volumeBreakout', { breakoutDays: 120 })).toBe(
      121,
    );
  });
});

describe('策略参数校验', () => {
  const dto = (extra: any) =>
    plainToInstance(
      StrategyListQueryDto,
      {
        date: '2026-09-30',
        strategyType: 'fiveMaUp',
        ...extra,
      },
      { enableImplicitConversion: true },
    );
  test('false字符串不会误转为true，合法数值参数能转换', async () => {
    const query = dto({
      aboveMa5: 'false',
      bullish: 'true',
      expandingVolume: 'false',
      breakoutDays: '20',
    });
    expect(query).toMatchObject({
      aboveMa5: false,
      bullish: true,
      expandingVolume: false,
      breakoutDays: 20,
    });
    expect(await validate(query)).toEqual([]);
  });
  test.each([
    { breakoutDays: 0 },
    { breakoutDays: 20.5 },
    { volumeMultiple: 'NaN' },
    { contractionRatio: 0 },
    { fiveMaMode: 'x' },
    { aboveMa5: 'yes' },
    { minTurnoverRateF: -1 },
    { minTurnoverRateF: 'NaN' },
    { minTurnoverRateF: 1001 },
    { minTurnoverRateF: 5.001 },
  ])('拒绝无效参数 %j', async (query) => {
    expect((await validate(dto(query))).length).toBeGreaterThan(0);
  });
});
