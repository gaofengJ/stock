/** Bounded chart cache with shared in-flight work and cancellation per consumer. */
export function createChartLoader<T>(read: (params: Record<string, unknown>, signal: AbortSignal) => Promise<T>, now = Date.now) {
  type Entry = { promise: Promise<T>; controller: AbortController; users: number; done: boolean; expires: number };
  const entries = new Map<string, Entry>();
  const keyFor = (params: Record<string, unknown>) => JSON.stringify(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
  return {
    acquire(params: Record<string, unknown>, refresh = false) {
      const key = keyFor(params);
      let entry = entries.get(key);
      if (entry?.done && (refresh || entry.expires <= now())) { entries.delete(key); entry = undefined; }
      if (!entry) {
        const controller = new AbortController();
        const load = async () => {
          try { return await read(params, controller.signal); } catch (error) {
            const e = error as { code?: string; response?: { status?: number } };
            if (controller.signal.aborted || !(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(e.code || '') || [502, 503, 504].includes(e.response?.status || 0))) throw error;
            // Retry a transient failure once; never mask auth, business or adjustment errors.
            return read(params, controller.signal);
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
