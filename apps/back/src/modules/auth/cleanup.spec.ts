import 'reflect-metadata';
import { AuthService } from './auth.service';

describe('authentication scheduled cleanup', () => {
  const previous = process.env.SCHEDULE_ENABLED;

  afterEach(() => {
    if (previous === undefined) delete process.env.SCHEDULE_ENABLED;
    else process.env.SCHEDULE_ENABLED = previous;
  });

  it('does not delete clone data while rehearsal scheduling is disabled', async () => {
    process.env.SCHEDULE_ENABLED = 'false';
    const query = jest.fn();
    await new AuthService({ query } as any).cleanup();
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['true', undefined])(
    'retains production cleanup when scheduling is %s',
    async (flag) => {
      if (flag === undefined) delete process.env.SCHEDULE_ENABLED;
      else process.env.SCHEDULE_ENABLED = flag;
      const query = jest.fn().mockResolvedValue([]);
      await new AuthService({ query } as any).cleanup();
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[0][0]).toContain('DELETE FROM t_auth_session');
      expect(query.mock.calls[1][0]).toContain('DELETE FROM t_auth_audit');
    },
  );
});
