export const MAX_JOB_FAILURES = 5;
export type JobControl = 'pause' | 'cancel' | 'retry';

export function retryOutcome(
  status: string,
  failures: number,
  now = Date.now(),
  sourceRetryAt: Date | undefined = undefined,
) {
  const waiting =
    status === 'pending' &&
    !!sourceRetryAt &&
    Number.isFinite(sourceRetryAt.getTime());
  const count =
    failures + (!waiting && ['pending', 'failed'].includes(status) ? 1 : 0);
  const exhausted =
    status === 'pending' && !waiting && count >= MAX_JOB_FAILURES;
  let nextRetryAt: Date | null = null;
  if (status === 'pending' && !exhausted)
    nextRetryAt =
      waiting && sourceRetryAt
        ? new Date(Math.max(now, sourceRetryAt.getTime()))
        : new Date(now + Math.min(60, 5 * 2 ** (count - 1)) * 60000);
  return {
    status: exhausted ? 'failed' : status,
    failures: count,
    exhausted,
    nextRetryAt,
  };
}
