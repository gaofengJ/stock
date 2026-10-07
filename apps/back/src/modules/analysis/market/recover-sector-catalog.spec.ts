import { RecoverSectorCatalog1792108800000 } from '../../../migrations/1792108800000-RecoverSectorCatalog';

describe('automatic sector recovery', () => {
  const error = 'Empty criteria(s) are not allowed for the update method.';
  it('requeues an exhausted affected job without deleting any market data', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 31, status: 'failed', error }])
      .mockResolvedValueOnce([])
      .mockResolvedValue({ affectedRows: 1 });
    await new RecoverSectorCatalog1792108800000().up({ query } as any);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining("actor_id IS NULL AND status='failed'"),
      [31],
    );
  });
  it.each(['paused', 'cancelled', 'success', 'running', 'pending'])(
    'preserves %s jobs',
    async (status) => {
      const query = jest.fn().mockResolvedValue([{ id: 31, status, error }]);
      await new RecoverSectorCatalog1792108800000().up({ query } as any);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    [error, [{ id: 32 }]],
    ['权限不足', []],
  ])(
    'does not duplicate an active job or retry an unrelated failure: %s',
    async (failure, active) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: 31, status: 'failed', error: failure }])
        .mockResolvedValueOnce(active);
      await new RecoverSectorCatalog1792108800000().up({ query } as any);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(
        false,
      );
    },
  );
});
