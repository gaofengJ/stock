export interface WorkbenchSource {
  source: string;
  state: 'ready' | 'loading' | 'stale' | 'error' | 'unpublished';
  message?: string | null;
  fetchedAt?: string | null;
  nextRetryAt?: string | null;
}

export const sourcePending = (source?: WorkbenchSource) => !!source && (source.state === 'loading' || (source.state === 'stale' && !source.message));

function transientRequest(error: unknown) {
  const e = error as { status?: number; response?: { status?: number }; code?: string } | null;
  const status = e?.response?.status || e?.status;
  if (status) return [408, 429, 500, 502, 503, 504].includes(status);
  return ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET'].includes(e?.code || '');
}

function requestRetryDelay(error: unknown, failures: number) {
  const e = error as { status?: number; response?: { status?: number; headers?: Record<string, string> } };
  const status = e?.response?.status || e?.status;
  const header = e?.response?.headers?.['retry-after'];
  const after = header && (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now());
  const delay = [1000, 3000, 8000][failures];
  return Math.min(120000, Math.max(delay, status === 429 ? 10000 : 0, Number.isFinite(after) ? Number(after) : 0));
}

/** Poll only unfinished sources; never overlap reads or publish a cancelled response. */
export function startWorkbenchPolling<T extends { sources?: WorkbenchSource[] }>({
  read, onValue, onError, onStopped, onRetry, recoverSources = false,
}: { read: (signal: AbortSignal) => Promise<T>; onValue: (data: T) => void; onError: (error: unknown) => void; onStopped: () => void; onRetry?: () => void; recoverSources?: boolean }) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let polls = 0;
  let failures = 0;
  let retries = 0;
  let sourceRetries = 0;
  const load = async () => {
    try {
      const value = await read(controller.signal);
      if (controller.signal.aborted) return;
      failures = 0;
      onValue(value);
      if (value.sources?.some(sourcePending)) {
        const plansPending = value.sources.some((s) => s.source === 'reduction_plans' && sourcePending(s));
        if (polls >= (plansPending ? 100 : 60)) { onStopped(); return; }
        polls += 1;
        const interval = plansPending ? 5000 : 3000;
        timer = setTimeout(load, polls <= 3 ? 1000 : interval);
      } else if (recoverSources) {
        // Only short, server-declared cooldowns qualify. Never loop on permissions or daily quotas.
        const retryTimes = (value.sources || [])
          .filter((s) => (s.state === 'error' || s.state === 'stale') && s.message && s.nextRetryAt)
          .map((s) => Date.parse(s.nextRetryAt!))
          .filter((at) => Number.isFinite(at) && at >= Date.now() - 1000 && at <= Date.now() + 300000);
        if (retryTimes.length && sourceRetries < 2) {
          sourceRetries += 1;
          timer = setTimeout(load, Math.max(1000, Math.min(...retryTimes) - Date.now() + 500));
        } else if (retryTimes.length) onStopped();
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (transientRequest(error) && failures < 3 && retries < 6) {
        const delay = requestRetryDelay(error, failures);
        failures += 1;
        retries += 1;
        onRetry?.();
        timer = setTimeout(load, delay);
      } else onError(error);
    }
  };
  load();
  return () => { controller.abort(); clearTimeout(timer); };
}
