interface ICacheEntry<T> {
  expiresAt: number;
  promise: Promise<T>;
}

/**
 * 用于合并短时间内完全相同的只读分析请求。
 */
export class AsyncTtlCache {
  private entries = new Map<string, ICacheEntry<unknown>>();

  constructor(private readonly ttl: number) {}

  getOrCreate<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.entries.forEach((entry, entryKey) => {
      if (entry.expiresAt <= now) this.entries.delete(entryKey);
    });

    const cached = this.entries.get(key) as ICacheEntry<T> | undefined;
    if (cached) return cached.promise;

    const entry: ICacheEntry<T> = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise: loader(),
    };
    this.entries.set(key, entry as ICacheEntry<unknown>);

    entry.promise
      .then(() => {
        entry.expiresAt = Date.now() + this.ttl;
      })
      .catch(() => {
        if (this.entries.get(key)?.promise === entry.promise) {
          this.entries.delete(key);
        }
      });

    return entry.promise;
  }
}
