/* eslint-disable no-restricted-syntax -- Bound decompression and cache memory by processing one snapshot at a time. */
import { DataSource } from 'typeorm';
import { inflateSync } from 'zlib';

type SnapshotTable =
  | 't_source_strategy_factor'
  | 't_processed_stock_insight'
  | 't_source_stock_history';
export type SnapshotVersion = {
  id: number;
  updatedAt: Date;
  revision?: string;
};
type Entry = {
  expires: number;
  bytes: number;
  promise: Promise<Buffer | undefined>;
};

/** Keep compressed, versioned blobs rather than retaining whole-market objects. */
export class StrategySnapshotReader {
  private entries = new Map<string, Entry>();

  constructor(
    private db: DataSource,
    private maxBytes = 16 * 1024 * 1024,
  ) {}

  private key(table: SnapshotTable, row: SnapshotVersion, paths?: string[]) {
    return `${table}:${row.id}:${new Date(row.updatedAt).getTime()}:${
      row.revision || ''
    }:${JSON.stringify(paths || [])}`;
  }

  private trim() {
    let bytes = [...this.entries.values()].reduce(
      (sum, row) => sum + row.bytes,
      0,
    );
    for (const [key, entry] of this.entries) {
      if (
        entry.expires <= Date.now() ||
        bytes > this.maxBytes ||
        this.entries.size > 512
      ) {
        this.entries.delete(key);
        bytes -= entry.bytes;
      }
    }
  }

  async read<T>(
    table: SnapshotTable,
    versions: SnapshotVersion[],
    project: (value: any, id: number) => T,
    paths?: string[],
  ): Promise<Map<number, T>> {
    this.trim();
    const result = new Map<number, T>();
    // Decode one day at a time and only retain the caller's required projection.
    // Eight compressed days bound query size and temporary parsing memory.
    for (let offset = 0; offset < versions.length; offset += 8) {
      const chunk = versions.slice(offset, offset + 8);
      const missing = chunk.filter(
        (row) => !this.entries.has(this.key(table, row, paths)),
      );
      if (missing.length) {
        const batch = this.db.query<(SnapshotVersion & { packed: Buffer })[]>(
          `SELECT id,updated_at updatedAt,${
            table === 't_processed_stock_insight' ? 'revision,' : ''
          }COMPRESS(${
            paths?.length
              ? `JSON_EXTRACT(data,${paths.map(() => '?').join(',')})`
              : 'data'
          }) packed FROM ${table} WHERE id IN (?)`,
          [...(paths || []), missing.map((row) => row.id)],
        );
        missing.forEach((row) => {
          const key = this.key(table, row, paths);
          const entry: Entry = {
            expires: Infinity,
            bytes: 0,
            promise: batch.then(
              (rows) =>
                rows.find((value) => this.key(table, value, paths) === key)
                  ?.packed,
            ),
          };
          this.entries.set(key, entry);
          entry.promise
            .then((packed) => {
              if (!packed) {
                if (this.entries.get(key) === entry) this.entries.delete(key);
                return;
              }
              entry.bytes = packed.length + key.length * 2;
              entry.expires = Date.now() + 30 * 60_000;
              this.trim();
            })
            .catch(() => {
              if (this.entries.get(key) === entry) this.entries.delete(key);
            });
        });
      }
      const pending = chunk.map(
        (row) =>
          [
            row.id,
            this.entries.get(this.key(table, row, paths))!.promise,
          ] as const,
      );
      for (const [id, promise] of pending) {
        // MySQL COMPRESS prefixes the zlib stream with a four-byte length.
        // eslint-disable-next-line no-await-in-loop
        const packed = await promise;
        if (packed)
          result.set(
            id,
            project(
              JSON.parse(inflateSync(packed.subarray(4)).toString('utf8')),
              id,
            ),
          );
      }
    }
    return result;
  }
}
