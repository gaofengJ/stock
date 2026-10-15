import { createHash } from 'crypto';
import { SnapshotVersion } from './snapshot-reader';
import { TrendFactor } from './trend.entity';

/** Cache only projected tuples; every request still reads current content hashes. */
export class FactorProjectionCache {
  private entries = new Map<string, { value: TrendFactor[]; bytes: number }>();

  private bytes = 0;

  constructor(private maxBytes = 48 * 1024 * 1024) {}

  async read(
    versions: SnapshotVersion[],
    codes: Set<string>,
    load: (missing: SnapshotVersion[]) => Promise<Map<number, TrendFactor[]>>,
  ): Promise<Map<number, TrendFactor[]>> {
    const selection = createHash('sha256')
      .update(JSON.stringify([...codes].sort()))
      .digest('hex');
    const key = (row: SnapshotVersion) =>
      JSON.stringify([row.id, row.updatedAt, row.contentHash, selection]);
    const result = new Map<number, TrendFactor[]>();
    const missing: SnapshotVersion[] = [];
    versions.forEach((row) => {
      const entry = row.contentHash ? this.entries.get(key(row)) : undefined;
      if (entry) result.set(row.id, entry.value);
      else missing.push(row);
    });
    if (missing.length) {
      const loaded = await load(missing);
      missing.forEach((row) => {
        const value = loaded.get(row.id);
        if (!value) return;
        result.set(row.id, value);
        if (!row.contentHash) return;
        const id = key(row);
        const bytes =
          JSON.stringify(value).length * 4 + value.length * 128 + id.length * 2;
        if (bytes > this.maxBytes) return;
        const prior = this.entries.get(id);
        this.bytes -= prior?.bytes || 0;
        this.entries.set(id, { value, bytes });
        this.bytes += bytes;
        while (this.bytes > this.maxBytes || this.entries.size > 512) {
          const oldest = this.entries.keys().next().value!;
          this.bytes -= this.entries.get(oldest)!.bytes;
          this.entries.delete(oldest);
        }
      });
    }
    // Consumers cannot mutate the cached tuples or leak modifications to others.
    return new Map(
      [...result].map(([id, value]) => [
        id,
        value.map((row) => [...row] as TrendFactor),
      ]),
    );
  }
}
