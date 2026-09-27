import { inScope } from './market.constants';
import { marketStats, MarketDailyRow, MarketLimitRow } from './market.utils';

const daily = (
  tsCode: string,
  pctChg = '1',
  amount = '100000',
): MarketDailyRow => ({
  tsCode,
  name: '测试股票',
  amount,
  pctChg,
  open: '10.5',
  close: '11',
  preClose: '10',
  high: '11',
  low: '10',
});
const limit = (tsCode: string, limitTimes = 1, type = 'U'): MarketLimitRow => ({
  tsCode,
  limitTimes,
  limit: type,
});

describe('市场分析统计口径', () => {
  it('沪深京分区排除B股与非股票代码，创业科创不计入主板', () => {
    expect(inScope('920001.BJ', 'all')).toBe(true);
    expect(inScope('920001.BJ', 'hs')).toBe(false);
    expect(inScope('300001.SZ', 'main')).toBe(false);
    expect(inScope('688001.SH', 'star')).toBe(true);
    expect(inScope('900901.SH', 'all')).toBe(false);
    expect(inScope('510300.SH', 'all')).toBe(false);
  });
  it('负的小数涨幅不混进平盘，正负边界均不遗漏', () => {
    const changes = [-30, -9, -8, -0.5, 0, 0.5, 1, 8.9, 9, 30];
    const rows = changes.map((n, i) => daily(`60000${i}.SH`, String(n)));
    const s = marketStats('all', rows, [], [], []);
    expect(s.distribution.reduce((a, b) => a + b)).toBe(10);
    expect(s.distribution[0]).toBe(2);
    expect(s.distribution[1]).toBe(1);
    expect(s.distribution[9]).toBe(1);
    expect(s.distribution[10]).toBe(1);
    expect(s.distribution[11]).toBe(1);
    expect(s.distribution[20]).toBe(2);
    expect(s).toMatchObject({ up: 5, down: 4, flat: 1, amount: 10 });
  });
  it('空事件率为null而非0，确实无涨停则数量为0', () => {
    expect(marketStats('all', [daily('600001.SH')], [], [], [])).toMatchObject({
      limitUp: 0,
      brokenRate: null,
      sealRate: null,
      highOpenRate: null,
      averageChange: null,
    });
  });
  it('触板去重，回封股票不会再次计入炸板', () => {
    const s = marketStats(
      'all',
      [],
      [
        limit('600001.SH'),
        limit('600001.SH', 1, 'Z'),
        limit('600002.SH', 1, 'Z'),
      ],
      [],
      [],
    );
    expect(s).toMatchObject({
      limitUp: 1,
      broken: 1,
      sealRate: 50,
      brokenRate: 50,
    });
  });
  it('晋级必须是昨日相同股票，不能直接拿当天数量相除', () => {
    const s = marketStats(
      'all',
      [],
      [limit('600002.SH', 2)],
      [],
      [limit('600001.SH', 1)],
    );
    expect(s.upgrades[0]).toEqual({
      from: 1,
      numerator: 0,
      denominator: 1,
      rate: 0,
    });
  });
  it('北交所旧代码到新代码仍能匹配晋级和涨停股收益', () => {
    const s = marketStats(
      'bj',
      [daily('920163.BJ', '2')],
      [limit('920163.BJ', 3)],
      [daily('838163.BJ')],
      [limit('838163.BJ', 2)],
      (c) => c.replace('838163', '920163'),
    );
    expect(s.upgrades[1].rate).toBe(100);
    expect(s).toMatchObject({
      previousSample: 1,
      riseRate: 100,
      averageChange: 2,
    });
  });
  it('昨日一字、ST、新股、退市整理和今日停牌不参与表现样本', () => {
    const previous = Array.from({ length: 6 }, (_, i) => daily(`60000${i}.SH`));
    previous[0].high = previous[0].low;
    previous[1].name = '*ST股票';
    previous[2].name = 'N股票';
    previous[3].name = '股票退';
    const today = previous.map((r) => ({ ...r }));
    today[4].amount = '0';
    const s = marketStats(
      'all',
      today,
      [],
      previous,
      previous.map((r) => limit(r.tsCode)),
    );
    expect(s.previousSample).toBe(1);
  });
});
