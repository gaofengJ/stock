import {
  calculateMood,
  latestSyncDate,
  normalizeDate,
  shanghaiDate,
} from './sync.utils';

describe('同步日期与情绪计算', () => {
  it('北京时间 20:30 才纳入当日，时区与宿主系统无关', () => {
    expect(latestSyncDate(new Date('2024-07-01T12:29:59Z'))).toBe('2024-06-30');
    expect(latestSyncDate(new Date('2024-07-01T12:30:00Z'))).toBe('2024-07-01');
    expect(shanghaiDate(new Date('2024-07-01T16:01:00Z'))).toBe('2024-07-02');
    expect(latestSyncDate(new Date('2024-07-01T16:01:00Z'))).toBe('2024-07-01');
  });

  it('拒绝不存在的日期和空日期', () => {
    expect(() => normalizeDate('2024-02-30')).toThrow();
    expect(() => normalizeDate('')).toThrow();
  });

  it('保留现有筛选和百分比计算口径，处理零分母', () => {
    const normal = {
      tsCode: '000001.SZ',
      name: '普通股票',
      high: '11',
      low: '9',
      open: '10.5',
      close: '11',
      preClose: '10',
    };
    const st = { ...normal, tsCode: '000002.SZ', name: 'ST股票' };
    const single = { ...normal, tsCode: '000003.SZ', high: '11.00', low: '11' };
    const current = [normal, st, single];
    const limits = current.map((i) => ({
      tsCode: i.tsCode,
      name: i.name,
      limit: 'U',
    }));
    const mood = calculateMood('2024-07-01', current, limits, current, limits);
    expect(mood).toMatchObject({
      a: 1,
      b: 1,
      c: 1,
      d: 1,
      e: 0,
      sentiA: '1',
      sentiB: '100',
      sentiC: '100',
      sentiD: '0',
    });
    expect(calculateMood('2024-07-01', [], [], [], [])).toMatchObject({
      sentiB: '0',
      sentiC: '0',
      sentiD: '0',
    });
  });
});
