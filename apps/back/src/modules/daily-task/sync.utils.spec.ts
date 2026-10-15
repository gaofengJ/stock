import {
  calculateMood,
  latestSyncDate,
  normalizeDate,
  shanghaiDate,
  sourceThrottleDelay,
  referenceNeedsRefresh,
} from './sync.utils';

describe('同步日期与情绪计算', () => {
  it('晚间首次同步刷新凌晨名录，后续批次复用晚间快照', () => {
    const early = new Date('2026-10-14T16:14:14Z');
    const evening = new Date('2026-10-15T12:30:00Z');
    expect(referenceNeedsRefresh(early, new Date('2026-10-15T12:29:59Z'))).toBe(
      false,
    );
    expect(referenceNeedsRefresh(early, evening)).toBe(true);
    expect(
      referenceNeedsRefresh(evening, new Date('2026-10-15T14:00:00Z')),
    ).toBe(false);
    expect(
      referenceNeedsRefresh(evening, new Date('2026-10-15T16:00:00Z')),
    ).toBe(true);
    expect(referenceNeedsRefresh(undefined, evening)).toBe(true);
    expect(referenceNeedsRefresh(new Date(NaN), evening)).toBe(true);
  });
  it('未来或无效阶段时间最多等待一个限流周期，正常时间仍遵守请求间隔', () => {
    const now = Date.parse('2026-10-11T00:00:00Z');
    expect(sourceThrottleDelay(new Date(now + 8 * 3600000), 2100, now)).toBe(
      2100,
    );
    expect(sourceThrottleDelay(new Date(NaN), 2100, now)).toBe(2100);
    expect(sourceThrottleDelay(new Date(now - 1000), 2100, now)).toBe(1100);
    expect(sourceThrottleDelay(new Date(now - 3000), 2100, now)).toBe(0);
    expect(sourceThrottleDelay(undefined, 2100, now)).toBe(0);
  });
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
