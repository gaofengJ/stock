function waitForRequest(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      reject(Object.assign(new Error('Request cancelled'), { code: 'ERR_CANCELED' }));
    };
    timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}

/** Bounded chart cache with shared in-flight work and cancellation per consumer. */
export function createChartLoader<T>(read: (params: Record<string, unknown>, signal: AbortSignal) => Promise<T>, now = Date.now, wait = waitForRequest) {
  type Entry = { promise: Promise<T>; controller: AbortController; users: number; done: boolean; expires: number };
  const entries = new Map<string, Entry>();
  let cooldownUntil = 0;
  const remaining = () => Math.max(0, cooldownUntil - now());
  const keyFor = (params: Record<string, unknown>) => JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  return {
    cooldownSeconds: () => Math.ceil(remaining() / 1000),
    acquire(params: Record<string, unknown>, refresh = false, delayMs = 0) {
      const key = keyFor(params);
      let entry = entries.get(key);
      if (entry?.done && (refresh || entry.expires <= now())) { entries.delete(key); entry = undefined; }
      if (!entry) {
        const controller = new AbortController();
        const perform = async (): Promise<T> => {
          while (remaining() > 0) {
            // All requests, including prefetch, honor the same server cooldown.
            // eslint-disable-next-line no-await-in-loop
            await wait(remaining(), controller.signal);
          }
          if (controller.signal.aborted) throw Object.assign(new Error('Request cancelled'), { code: 'ERR_CANCELED' });
          try {
            return await read(params, controller.signal);
          } catch (error) {
            const e = error as { response?: { status?: number; headers?: Record<string, unknown> } };
            if (e.response?.status === 429) {
              const value = e.response.headers?.['retry-after'];
              const seconds = value == null ? NaN : Number(value);
              const duration = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(value)) - now();
              cooldownUntil = Math.max(cooldownUntil, now() + (Number.isFinite(duration) && duration > 0 ? duration : 10000));
            }
            throw error;
          }
        };
        const load = async () => {
          if (delayMs > 0) await wait(delayMs, controller.signal);
          try { return await perform(); } catch (error) {
            const e = error as { code?: string; response?: { status?: number } };
            if (controller.signal.aborted || !(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(e.code || '') || [429, 502, 503, 504].includes(e.response?.status || 0))) throw error;
            // Retry once; a 429 waits for Retry-After and remains cancellable.
            return perform();
          }
        };
        const fresh: Entry = {
          promise: load(), controller, users: 0, done: false, expires: Infinity,
        };
        entry = fresh; entries.set(key, fresh);
        fresh.promise.then(() => {
          fresh.done = true; fresh.expires = now() + 60000;
          const completed = Array.from(entries).filter(([, item]) => item.done && !item.users);
          completed.slice(0, Math.max(0, entries.size - 12)).forEach(([id]) => entries.delete(id));
        }).catch(() => { if (entries.get(key) === fresh) entries.delete(key); });
      }
      const current = entry; current.users += 1;
      let released = false;
      return {
        promise: current.promise,
        release() {
          if (released) return; released = true; current.users -= 1;
          queueMicrotask(() => { if (!current.users && !current.done) { current.controller.abort(); if (entries.get(key) === current) entries.delete(key); } });
        },
      };
    },
  };
}
