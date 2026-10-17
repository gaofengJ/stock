import { MarketSyncService } from './market-sync.service';
import { SyncRunEntity } from '../../daily-task/sync-run.entity';
import { SyncDependencyNotReadyError } from '../../daily-task/sync.utils';
import { IncompleteFactorSnapshotError } from '../../strategy/trend-errors';

describe('sync stage dependency waits', () => {
  it.each([
    [new SyncDependencyNotReadyError('等待完整复权历史'), 'pending', 2],
    [
      new IncompleteFactorSnapshotError([
        { code: '002142.SZ', date: '2026-10-15' },
      ]),
      'pending',
      2,
    ],
    [new Error('network timeout'), 'failed', undefined],
  ])(
    'records %s without confusing waiting with execution failure',
    async (error, status, attempts) => {
      const manager: any = {
        findOneBy: jest
          .fn()
          .mockResolvedValue({ id: 1, status: 'pending', attempts: 2 }),
        save: jest.fn().mockResolvedValue({ id: 1 }),
        update: jest.fn(),
      };
      const service = new MarketSyncService({} as any, {} as any, {} as any);
      await expect(
        service.stage(manager, 'stock-insight', '2026-10-16', async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      const update = manager.update.mock.calls[0];
      expect(update.slice(0, 2)).toEqual([SyncRunEntity, 1]);
      expect(update[2]).toMatchObject({ status, error: error.message });
      expect(update[2].attempts).toBe(attempts);
    },
  );
});
