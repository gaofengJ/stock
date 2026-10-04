export const MAX_JOB_FAILURES = 5;
export type JobControl = 'pause' | 'cancel' | 'retry';

export function retryOutcome(
  status: string,
  failures: number,
  now = Date.now(),
) {
  const count = failures + (['pending', 'failed'].includes(status) ? 1 : 0);
  const exhausted = status === 'pending' && count >= MAX_JOB_FAILURES;
  return {
    status: exhausted ? 'failed' : status,
    failures: count,
    exhausted,
    nextRetryAt:
      status === 'pending' && !exhausted
        ? new Date(now + Math.min(60, 5 * 2 ** (count - 1)) * 60000)
        : null,
  };
}
