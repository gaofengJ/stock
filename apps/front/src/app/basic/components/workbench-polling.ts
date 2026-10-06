export interface WorkbenchSource {
  source: string;
  state: 'ready' | 'loading' | 'stale' | 'error' | 'unpublished';
  message?: string | null;
  fetchedAt?: string | null;
  nextRetryAt?: string | null;
}

export const sourcePending = (source?: WorkbenchSource) => !!source && (source.state === 'loading' || (source.state === 'stale' && !source.message));

/** Poll only unfinished sources; never overlap reads or publish a cancelled response. */
export function startWorkbenchPolling<T extends { sources?: WorkbenchSource[] }>({
  read, onValue, onError, onStopped,
}: { read: (signal: AbortSignal) => Promise<T>; onValue: (data: T) => void; onError: (error: unknown) => void; onStopped: () => void }) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let polls = 0;
  const load = async () => {
    try {
      const value = await read(controller.signal);
      if (controller.signal.aborted) return;
      onValue(value);
      if (value.sources?.some(sourcePending)) {
        const plansPending = value.sources.some((s) => s.source === 'reduction_plans' && sourcePending(s));
        if (polls >= (plansPending ? 100 : 60)) { onStopped(); return; }
        polls += 1;
        const interval = plansPending ? 5000 : 3000;
        timer = setTimeout(load, polls <= 3 ? 1000 : interval);
      }
    } catch (error) { if (!controller.signal.aborted) onError(error); }
  };
  load();
  return () => { controller.abort(); clearTimeout(timer); };
}
