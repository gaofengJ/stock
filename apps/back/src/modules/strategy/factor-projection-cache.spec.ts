import { FactorProjectionCache } from './factor-projection-cache';
import { TrendFactor } from './trend.entity';

const first = {
  id: 1,
  updatedAt: new Date('2026-10-01'),
  contentHash: 'first',
};
const tuple: TrendFactor = ['000001.SZ', 10, 11, 12, 9];
describe('factor projection reuse', () => {
  it('reuses identical versions and code sets, while isolating caller mutations', async () => {
    const cache = new FactorProjectionCache();
    const load = jest.fn(
      async () => new Map([[1, [[...tuple] as TrendFactor]]]),
    );
    const a = await cache.read([first], new Set(['a', 'b']), load);
    a.get(1)![0][1] = 999;
    const b = await cache.read([first], new Set(['b', 'a']), load);
    expect(load).toHaveBeenCalledTimes(1);
    expect(b.get(1)![0][1]).toBe(10);
    await cache.read(
      [{ ...first, contentHash: 'corrected' }],
      new Set(['a', 'b']),
      load,
    );
    await cache.read([first], new Set(['a']), load);
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('does not cache missing, failed or unversioned snapshots', async () => {
    const cache = new FactorProjectionCache();
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error('failed'))
      .mockResolvedValueOnce(new Map())
      .mockResolvedValue(new Map([[1, [tuple]]]));
    await expect(cache.read([first], new Set(), load)).rejects.toThrow(
      'failed',
    );
    expect((await cache.read([first], new Set(), load)).size).toBe(0);
    await cache.read([first], new Set(), load);
    await cache.read([{ ...first, contentHash: undefined }], new Set(), load);
    await cache.read([{ ...first, contentHash: undefined }], new Set(), load);
    expect(load).toHaveBeenCalledTimes(5);
  });
  it('keeps a bounded cache even for changing selections', async () => {
    const cache = new FactorProjectionCache(1);
    const load = jest.fn(async () => new Map([[1, [tuple]]]));
    await cache.read([first], new Set(), load);
    await cache.read([first], new Set(), load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
