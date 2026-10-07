import { automaticSyncRetryBlocked } from './sync.utils';

describe('automatic failed-range cooldown', () => {
  const now = new Date('2026-10-07T12:00:00Z');
  const failure = {
    error: '北交所新旧代码均线数值冲突',
    updatedAt: new Date('2026-10-07T11:00:00Z'),
    endDate: '2026-09-30',
  };
  it('does not recreate an exhausted range on every scheduler or restart entry', () => {
    expect(automaticSyncRetryBlocked(failure, failure.endDate, now)).toBe(true);
    expect(automaticSyncRetryBlocked(failure, '2026-09-29', now)).toBe(true);
    expect(
      automaticSyncRetryBlocked(
        failure,
        failure.endDate,
        new Date('2026-10-08T11:00:00Z'),
      ),
    ).toBe(false);
  });
  it('continues new trading days and ranges without previous failures', () => {
    expect(automaticSyncRetryBlocked(failure, '2026-10-08', now)).toBe(false);
    expect(automaticSyncRetryBlocked(undefined, '2026-09-30', now)).toBe(false);
  });
  it('retains the existing permission/quota pause until the next Beijing day', () => {
    const quota = { ...failure, error: '每日配额不足' };
    expect(automaticSyncRetryBlocked(quota, '2026-10-08', now)).toBe(true);
    expect(
      automaticSyncRetryBlocked(
        quota,
        '2026-10-08',
        new Date('2026-10-07T16:00:00Z'),
      ),
    ).toBe(false);
  });
});
