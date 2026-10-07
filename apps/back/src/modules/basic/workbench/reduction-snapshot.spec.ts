import { BasicSnapshotService } from './snapshot.service';
import * as plans from './public-reduction-plans';
import { ReductionSourceError } from './reduction-request';

describe('reduction snapshot failure isolation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserves the complete last good data and date, exposes safe diagnostics, then clears errors on recovery', async () => {
    jest.useFakeTimers();
    try {
      const original = {
        rows: [{ ts_code: '600001.SH', plan_status: 'active' }],
        fetchedAt: new Date('2026-10-07T10:34:18Z'),
        retryAt: new Date(0),
        error: null as string | null,
      };
      let stored = original;
      const manager = {
        findOneBy: async () => stored,
        upsert: jest.fn(async (_entity, row) => {
          stored = row;
        }),
      };
      const read = jest
        .spyOn(plans, 'publicReductionPlans')
        .mockRejectedValueOnce(
          new ReductionSourceError(
            '减持公告正文获取失败（HTTP 502，尝试 3 次）',
          ),
        )
        .mockResolvedValueOnce({
          code: 0,
          data: { fields: ['ts_code'], items: [['600002.SH']] },
        });
      const service = new BasicSnapshotService(
        { manager } as any,
        {} as any,
        { withLock: (run: any) => run(manager) } as any,
      );
      await service.read('reduction_plans', {});
      await jest.advanceTimersByTimeAsync(10);
      expect(stored.rows).toEqual(original.rows);
      expect(stored.fetchedAt).toEqual(original.fetchedAt);
      expect(stored.error).toContain('HTTP 502');
      expect((await service.read('reduction_plans', {})).nextRetryAt).toBe(
        stored.retryAt.toISOString(),
      );
      expect(read).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(300001);
      await service.read('reduction_plans', {});
      await jest.advanceTimersByTimeAsync(10);
      expect(stored.error).toBeNull();
      expect(stored.rows).toEqual([{ ts_code: '600002.SH' }]);
      expect((await service.read('reduction_plans', {})).state).toBe('ready');
    } finally {
      jest.useRealTimers();
    }
  });
});
