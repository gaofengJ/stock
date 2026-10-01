import {
  feedbackGroups,
  ResearchDaily,
  ResearchLimit,
  trajectoryCell,
} from './market-research.utils';

const date = '2026-09-30';
const previous = '2026-09-29';
const earlier = '2026-09-28';
const daily = (
  code: string,
  tradeDate: string,
  change = 0,
  extra = {},
): ResearchDaily => ({
  tsCode: code,
  tradeDate,
  name: '普通股票',
  amount: '60000',
  open: '10.1',
  preClose: '10',
  close: '10',
  high: '11',
  low: '9',
  pctChg: String(change),
  ...extra,
});
const limit = (
  code: string,
  tradeDate: string,
  type = 'U',
  height = 1,
): ResearchLimit => ({
  tsCode: code,
  tradeDate,
  name: '普通股票',
  limit: type,
  limitTimes: height,
});

describe('强势股收益和负反馈口径', () => {
  test('均值、中位数、上涨比例及分布使用同一有效样本；零收益计入样本', () => {
    const codes = ['600001.SH', '600002.SH', '600003.SH', '600004.SH'];
    const prices = codes.flatMap((code, i) => [
      daily(code, previous),
      daily(code, date, [-10, 0, 1, 20][i]),
    ]);
    const [first] = feedbackGroups(
      date,
      previous,
      earlier,
      prices,
      codes.map((code) => limit(code, previous)),
      'all',
    );
    expect(first).toMatchObject({
      total: 4,
      sample: 4,
      excluded: 0,
      average: 2.75,
      median: 0.5,
      riseRate: 50,
      highOpenRate: 100,
    });
    expect(first.distribution).toEqual([1, 0, 0, 1, 1, 0, 1]);
  });
  test('一字板、ST、无成交、缺行情分别剔除；空样本不伪造零收益', () => {
    const codes = ['600001.SH', '600002.SH', '600003.SH', '600004.SH'];
    const prices = [
      daily(codes[0], previous, 0, { high: '10', low: '10' }),
      daily(codes[0], date),
      daily(codes[1], previous, 0, { name: 'ST股票' }),
      daily(codes[1], date),
      daily(codes[2], previous),
      daily(codes[2], date, 0, { amount: '0' }),
      daily(codes[3], previous),
    ];
    const [first] = feedbackGroups(
      date,
      previous,
      earlier,
      prices,
      codes.map((code) => limit(code, previous)),
      'all',
    );
    expect(first).toMatchObject({
      total: 4,
      sample: 0,
      excluded: 4,
      average: null,
      median: null,
      riseRate: null,
    });
    expect(first.members.map((r) => r.excluded)).toEqual([
      '昨日一字板',
      'ST／新股／退市整理',
      '今日无成交',
      '今日行情缺失',
    ]);
  });
  test('昨日断板以此前连板为依据，可与炸板重叠；停牌不算断板', () => {
    const a = '600001.SH';
    const b = '600002.SH';
    const prices = [
      daily(a, previous),
      daily(a, date, -9, { high: '9.1', low: '9.1' }),
      daily(b, previous, 0, { amount: '0' }),
      daily(b, date),
    ];
    const groups = feedbackGroups(
      date,
      previous,
      earlier,
      prices,
      [
        limit(a, earlier, 'U', 3),
        limit(a, previous, 'Z', 0),
        limit(b, earlier, 'U', 2),
      ],
      'all',
    );
    expect(groups[2].sample).toBe(1);
    expect(groups[3].sample).toBe(1);
    expect(groups[3].members[0].tsCode).toBe(a);
    expect(groups[3].average).toBe(-9);
  });
  test('重复事件和北交所旧代码不重复计数，统计范围严格生效', () => {
    const old = '830001.BJ';
    const current = '920001.BJ';
    const sh = '600001.SH';
    const canonical = (code: string) => (code === old ? current : code);
    const events = [
      limit(old, previous),
      limit(current, previous),
      limit(sh, previous),
    ];
    const prices = [
      daily(old, previous),
      daily(current, date, 3),
      daily(sh, previous),
      daily(sh, date),
    ];
    expect(
      feedbackGroups(
        date,
        previous,
        earlier,
        prices,
        events,
        'bj',
        canonical,
      )[0],
    ).toMatchObject({ total: 1, sample: 1, average: 3 });
    expect(
      feedbackGroups(
        date,
        previous,
        earlier,
        prices,
        events,
        'hs',
        canonical,
      )[0].members.map((r) => r.tsCode),
    ).toEqual([sh]);
  });
});

describe('多日轨迹状态', () => {
  test('有成交且未涨停高度为0，停牌、缺行情、未发布保留未知', () => {
    const row = daily('600001.SH', date, -3);
    expect(trajectoryCell(date, true, row)).toMatchObject({
      state: '交易',
      height: 0,
      pctChg: -3,
      amount: 0.6,
    });
    expect(trajectoryCell(date, false, row)).toMatchObject({
      state: '待更新',
      height: null,
    });
    expect(trajectoryCell(date, true)).toMatchObject({
      state: '无行情',
      height: null,
    });
    expect(trajectoryCell(date, true, { ...row, amount: '0' })).toMatchObject({
      state: '无成交',
      height: null,
    });
  });
  test('跟踪同一股票晋级、断板与炸板；首板失败不误叫断板', () => {
    const row = daily('600001.SH', date);
    expect(
      trajectoryCell(date, true, row, [limit(row.tsCode, date, 'U', 4)]),
    ).toMatchObject({ state: '4板', height: 4 });
    expect(
      trajectoryCell(date, true, row, [], limit(row.tsCode, previous, 'U', 3)),
    ).toMatchObject({ state: '断板', height: 0 });
    expect(
      trajectoryCell(date, true, row, [limit(row.tsCode, date, 'Z', 0)]),
    ).toMatchObject({ state: '炸板', height: 0 });
    expect(
      trajectoryCell(date, true, row, [], limit(row.tsCode, previous)),
    ).toMatchObject({ state: '交易', height: 0 });
  });
});
