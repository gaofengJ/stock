import { deflateSync } from 'zlib';
import { StrategySnapshotReader } from './snapshot-reader';

export function packedJson(value: unknown) {
  const text = Buffer.from(JSON.stringify(value));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(text.length);
  return Buffer.concat([length, deflateSync(text)]);
}

describe('versioned strategy snapshot reader', () => {
  const table = 't_processed_stock_insight';
  const version = {
    id: 1,
    updatedAt: new Date('2026-09-30T00:00:00Z'),
    revision: 'v1',
  };
  it('coalesces concurrent reads, preserves null positions and does not retain mutated objects', async () => {
    const db: any = {
      query: jest
        .fn()
        .mockResolvedValue([
          { ...version, packed: packedJson([['000001.SZ', null, 0, '中文']]) },
        ]),
    };
    const reader = new StrategySnapshotReader(db);
    const results = await Promise.all([
      reader.read(table, [version], (v) => v),
      reader.read(table, [version], (v) => v),
    ]);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(results[0].get(1)).toEqual([['000001.SZ', null, 0, '中文']]);
    results[0].get(1)[0][1] = 100;
    expect(
      (await reader.read(table, [version], (v) => v)).get(1)[0][1],
    ).toBeNull();
  });
  it('rejects a changed snapshot and retries without caching the missing result', async () => {
    const current = { ...version, revision: 'v2' };
    const db: any = {
      query: jest
        .fn()
        .mockResolvedValue([{ ...current, packed: packedJson([2]) }]),
    };
    const reader = new StrategySnapshotReader(db);
    expect((await reader.read(table, [version], (v) => v)).size).toBe(0);
    expect((await reader.read(table, [current], (v) => v)).get(1)).toEqual([2]);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
  it('evicts failed loads and separates projections and timestamp versions', async () => {
    const newer = { ...version, updatedAt: new Date('2026-10-01T00:00:00Z') };
    const db: any = {
      query: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValueOnce([{ ...version, packed: packedJson(['code']) }])
        .mockResolvedValueOnce([
          { ...version, packed: packedJson({ close: 3 }) },
        ])
        .mockResolvedValueOnce([
          { ...newer, packed: packedJson({ close: 4 }) },
        ]),
    };
    const reader = new StrategySnapshotReader(db);
    await expect(
      reader.read(table, [version], (v) => v, ['$[*].code']),
    ).rejects.toThrow('temporary');
    expect(
      (await reader.read(table, [version], (v) => v, ['$[*].code'])).get(1),
    ).toEqual(['code']);
    expect(
      (await reader.read(table, [version], (v) => v, ['$[0]'])).get(1),
    ).toEqual({ close: 3 });
    expect(
      (await reader.read(table, [newer], (v) => v, ['$[0]'])).get(1),
    ).toEqual({ close: 4 });
    expect(db.query).toHaveBeenCalledTimes(4);
    expect(db.query.mock.calls[1][1]).toEqual(['$[*].code', [1]]);
  });
  it('bounds compressed cache memory and evicts old entries without disrupting callers', async () => {
    const db: any = {
      query: jest
        .fn()
        .mockResolvedValue([{ ...version, packed: packedJson([1]) }]),
    };
    const reader = new StrategySnapshotReader(db, 1);
    expect((await reader.read(table, [version], (v) => v)).get(1)).toEqual([1]);
    expect((await reader.read(table, [version], (v) => v)).get(1)).toEqual([1]);
    expect(db.query).toHaveBeenCalledTimes(2);
  });
});
