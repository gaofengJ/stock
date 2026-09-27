/** 按体积和条数限制的查询缓存；并发请求合并，错误不缓存。 */
export class DragonCache<T> {
  private entries = new Map<
    string,
    { value: T; expires: number; size: number }
  >();

  private pending = new Map<string, Promise<T>>();

  async get(
    key: string,
    loader: () => Promise<T>,
    empty: (value: T) => boolean,
  ): Promise<T> {
    const now = Date.now();
    this.entries.forEach((v, k) => {
      if (v.expires <= now) this.entries.delete(k);
    });
    const cached = this.entries.get(key);
    if (cached) return cached.value;
    const pending = this.pending.get(key);
    if (pending) return pending;
    // 每个详情只发两个请求，同时最多4个详情加载。
    if (this.pending.size >= 4) throw new Error('龙虎榜查询繁忙，请稍后重试');
    const request = loader()
      .then((value) => {
        const size = Buffer.byteLength(JSON.stringify(value));
        const maximum = 10 * 1024 * 1024;
        if (size <= maximum) {
          while (
            this.entries.size >= 100 ||
            [...this.entries.values()].reduce((n, v) => n + v.size, 0) + size >
              maximum
          ) {
            this.entries.delete(this.entries.keys().next().value);
          }
          this.entries.set(key, {
            value,
            size,
            expires: Date.now() + (empty(value) ? 60000 : 900000),
          });
        }
        return value;
      })
      .finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
