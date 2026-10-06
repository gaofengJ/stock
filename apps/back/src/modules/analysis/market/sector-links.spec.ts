import { SectorService } from './sector.service';
import { SectorEntity } from './sector.entity';

describe('sector membership lookup reuse', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reuses membership across pages, preserves BSE aliases, and separates historical dates', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    const find = jest.fn(async (entity) =>
      entity === SectorEntity
        ? [{ tsCode: '881101.TI', name: '行业', type: 'I' }]
        : [{ oldCode: '830001.BJ', newCode: '920001.BJ' }],
    );
    const service = new SectorService(
      { hasMetadata: () => true, manager: { find } } as any,
      null!,
      null!,
      null!,
    );
    const snapshots = jest
      .spyOn(service, 'snapshots')
      .mockImplementation(async (date, _, __, kind) =>
        kind === 'I'
          ? [
              {
                tsCode: '881101.TI',
                asOf: date!,
                members: [
                  { code: '920001.BJ', name: '' },
                  { code: '000001.SZ', name: '' },
                ],
              },
            ]
          : [],
      );
    const old = await service.links(['830001.BJ'], '2026-09-30');
    const current = await service.links(
      ['920001.BJ', '000001.SZ'],
      '2026-09-30',
    );
    expect(old.get('830001.BJ')).toEqual(current.get('920001.BJ'));
    expect(snapshots).toHaveBeenCalledTimes(2);
    expect(find).toHaveBeenCalledTimes(2);
    expect(
      (await service.links(['000001.SZ'], '2026-09-29')).get('000001.SZ')?.[0]
        .asOf,
    ).toBe('2026-09-29');
    clock.mockReturnValue(32001);
    await service.links(['000001.SZ'], '2026-09-30');
    expect(snapshots).toHaveBeenCalledTimes(6);
  });

  it('skips all database work for empty results', async () => {
    const find = jest.fn();
    const service = new SectorService(
      { hasMetadata: () => true, manager: { find } } as any,
      null!,
      null!,
      null!,
    );
    expect(await service.decorate([])).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});
