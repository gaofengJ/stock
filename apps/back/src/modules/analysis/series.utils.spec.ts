import {
  calculateFirstUpgradeRates,
  calculateUpgradeRates,
  fillAmountSeries,
  fillCountSeries,
  fillTradeDateSeries,
} from './series.utils';

const tradeDays = [
  { calDate: '2024-07-03', preTradeDate: '2024-07-02' },
  { calDate: '2024-07-01', preTradeDate: '2024-06-28' },
  { calDate: '2024-07-02', preTradeDate: '2024-07-01' },
];

describe('analysis series utils', () => {
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
