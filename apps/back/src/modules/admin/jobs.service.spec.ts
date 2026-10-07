import { JobsService } from './jobs.service';
import { retryOutcome } from './job-policy';

describe('source cooldown and existing job lifecycle', () => {
  const setup = (result: any, currentStatus = 'running') => {
    const current = {
      status: currentStatus,
      retry_count: 4,
      completed_dates: [],
    };
    const manager = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string) =>
          sql.startsWith('SELECT status,retry_count')
            ? [current]
            : { affectedRows: 1 },
        ),
    };
    const job = {
      id: 601,
      actor_id: null,
      mode: 'hot',
      active_key: 'stock-hot-history',
      startDate: '2026-07-08',
      endDate: '2026-09-30',
      completed_dates: [],
    };
    const db = {
      query: jest
        .fn()
        .mockImplementation(async (sql: string) =>
          sql.startsWith('SELECT *,DATE_FORMAT') ? [job] : { affectedRows: 1 },
        ),
      transaction: (fn: any) => fn(manager),
    };
    const auth = { audit: jest.fn() };
    const daily = { insightBatch: jest.fn().mockResolvedValue(result) };
    const locks = { run: (fn: any) => fn() };
    const service = new JobsService(
      db as any,
      daily as any,
      auth as any,
      locks as any,
    );
    return { service, manager, auth, job };
  };
  const waiting = () => ({
    completed: [],
    failures: [],
    remaining: 1,
    protectedDates: [],
    retryAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    waitingReason: '等待源端补齐：2026-08-18',
  });

  it('persists source expiry and keeps ownership without exhausting four prior failures', async () => {
    const result = waiting();
    const test = setup(result);
    await (test.service as any).tickMarket();
    const [, args] = test.manager.query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE t_admin_job SET status=?'),
    )!;
    expect(args[0]).toBe('pending');
    expect(args[3]).toBe(result.waitingReason);
    expect(args[4]).toBe(4);
    expect(args[5]).toEqual(result.retryAt);
    expect(args[6]).toBe(test.job.active_key);
    expect(args[7]).toBeNull();
    expect(test.auth.audit).not.toHaveBeenCalled();
  });
  it('a real fifth failure still stops retrying even if a source expiry is also supplied', async () => {
    const test = setup({ ...waiting(), failures: ['network timeout'] });
    await (test.service as any).tickMarket();
    const [, args] = test.manager.query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE t_admin_job SET status=?'),
    )!;
    expect(args[0]).toBe('failed');
    expect(args[4]).toBe(5);
    expect(args[5]).toBeNull();
    expect(args[6]).toBeNull();
    expect(test.auth.audit).toHaveBeenCalled();
  });
  it.each(['pausing', 'cancelling'])(
    'source waiting never overrides a user stop: %s',
    async (state) => {
      const test = setup(waiting(), state);
      await (test.service as any).tickMarket();
      const [, args] = test.manager.query.mock.calls.find(([sql]) =>
        sql.startsWith('UPDATE t_admin_job SET status=?'),
      )!;
      expect(args[0]).toBe(state === 'pausing' ? 'paused' : 'cancelled');
      expect(args[5]).toBeNull();
    },
  );
  it('healthy completion still clears the active key and writes completion audit', async () => {
    const test = setup({
      completed: ['2026-08-18'],
      failures: [],
      remaining: 0,
      protectedDates: [],
    });
    await (test.service as any).tickMarket();
    const [, args] = test.manager.query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE t_admin_job SET status=?'),
    )!;
    expect(args[0]).toBe('success');
    expect(args[4]).toBe(4);
    expect(args[6]).toBeNull();
    expect(test.auth.audit).toHaveBeenCalled();
  });
  it('a source wait that expires during processing becomes due without counting a failure', () => {
    expect(retryOutcome('pending', 4, 1000, new Date(1000))).toMatchObject({
      status: 'pending',
      failures: 4,
      exhausted: false,
      nextRetryAt: new Date(1000),
    });
    expect(retryOutcome('pending', 4, 1000, new Date(2000))).toMatchObject({
      status: 'pending',
      failures: 4,
      exhausted: false,
      nextRetryAt: new Date(2000),
    });
  });

  it('invalid source expiry cannot disable the existing failure cap', () => {
    expect(retryOutcome('pending', 4, 1000, new Date(NaN))).toMatchObject({
      status: 'failed',
      failures: 5,
      exhausted: true,
      nextRetryAt: null,
    });
  });
});
