import {
  calculateFirstUpgradeRates,
  calculateUpgradeRates,
  fillAmountSeries,
  fillCountSeries,
  fillTradeDateSeries,
  applySeriesStates,
  readSeriesStates,
  SeriesState,
} from './series.utils';

const tradeDays = [
  { calDate: '2024-07-03', preTradeDate: '2024-07-02' },
  { calDate: '2024-07-01', preTradeDate: '2024-06-28' },
  { calDate: '2024-07-02', preTradeDate: '2024-07-01' },
];

describe('analysis series utils', () => {
  it('已发布真零保持为0，缺失/失败/删除保护覆盖残留图表值为null', () => {
    const states = new Map<string, SeriesState>([
      ['2024-07-01', 'ready'],
      ['2024-07-02', 'failed'],
      ['2024-07-03', 'protected'],
    ]);
    expect(
      applySeriesStates(
        fillCountSeries(tradeDays, [{ tradeDate: '2024-07-02', count: 9 }]),
        states,
        ['count'],
      ),
    ).toEqual([
      { tradeDate: '2024-07-01', count: 0, state: 'ready' },
      { tradeDate: '2024-07-02', count: null, state: 'failed' },
      { tradeDate: '2024-07-03', count: null, state: 'protected' },
    ]);
  });

  it('晋级率的前一交易日未就绪时返回缺失，不伪造0%', () => {
    const states = new Map<string, SeriesState>([
      ['2024-06-28', 'pending'],
      ['2024-07-01', 'ready'],
      ['2024-07-02', 'ready'],
      ['2024-07-03', 'ready'],
    ]);
    expect(
      applySeriesStates(
        calculateUpgradeRates(tradeDays, [], []),
        states,
        ['rate'],
        tradeDays,
      ),
    ).toEqual([
      { tradeDate: '2024-07-01', rate: null, state: 'pending' },
      { tradeDate: '2024-07-02', rate: 0, state: 'ready' },
      { tradeDate: '2024-07-03', rate: 0, state: 'ready' },
    ]);
  });

  it('一次批量读取窗口与前置日状态，空窗口不访问数据库', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ date: '2024-07-01', state: 'ready' }]);
    expect(
      (await readSeriesStates({ query }, tradeDays)).get('2024-07-01'),
    ).toBe('ready');
    expect(query).toHaveBeenCalledTimes(1);
    expect(new Set(query.mock.calls[0][1][0])).toEqual(
      new Set(['2024-06-28', '2024-07-01', '2024-07-02', '2024-07-03']),
    );
    await readSeriesStates({ query }, []);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('按完整交易日补齐数量和金额的零值日期', () => {
    expect(
      fillCountSeries(tradeDays, [
        { tradeDate: '2024-07-01', count: 4 },
        { tradeDate: '2024-07-03', count: 2 },
      ]),
    ).toEqual([
      { tradeDate: '2024-07-01', count: 4 },
      { tradeDate: '2024-07-02', count: 0 },
      { tradeDate: '2024-07-03', count: 2 },
    ]);

    expect(
      fillAmountSeries(tradeDays, [
        { tradeDate: '2024-07-02', totalAmount: 100 },
      ]),
    ).toEqual([
      { tradeDate: '2024-07-01', totalAmount: 0 },
      { tradeDate: '2024-07-02', totalAmount: 100 },
      { tradeDate: '2024-07-03', totalAmount: 0 },
    ]);
  });

  it('按前一交易日日期匹配晋级率分母，不使用稀疏数组下标', () => {
    expect(
      calculateUpgradeRates(
        tradeDays,
        [
          { tradeDate: '2024-07-02', count: 2 },
          { tradeDate: '2024-07-03', count: 1 },
        ],
        [
          { tradeDate: '2024-06-28', count: 4 },
          { tradeDate: '2024-07-02', count: 5 },
        ],
      ),
    ).toEqual([
      { tradeDate: '2024-07-01', rate: 0 },
      { tradeDate: '2024-07-02', rate: 0 },
      { tradeDate: '2024-07-03', rate: 20 },
    ]);
  });

  it('首板成功率保留没有涨停和炸板数据的交易日', () => {
    expect(
      calculateFirstUpgradeRates(
        tradeDays,
        [{ tradeDate: '2024-07-01', count: 3 }],
        [{ tradeDate: '2024-07-01', count: 1 }],
      ),
    ).toEqual([
      { tradeDate: '2024-07-01', rate: 75 },
      { tradeDate: '2024-07-02', rate: 0 },
      { tradeDate: '2024-07-03', rate: 0 },
    ]);
  });

  it('通用时间序列补齐缺失交易日并保持日期升序', () => {
    expect(
      fillTradeDateSeries(
        tradeDays,
        [{ tradeDate: '2024-07-02', value: 3 }],
        (tradeDate) => ({ tradeDate, value: 0 }),
      ),
    ).toEqual([
      { tradeDate: '2024-07-01', value: 0 },
      { tradeDate: '2024-07-02', value: 3 },
      { tradeDate: '2024-07-03', value: 0 },
    ]);
  });
});
