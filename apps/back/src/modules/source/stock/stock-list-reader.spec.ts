import { EntityManager } from 'typeorm';
import { readArchivedStocks, readHistoricNames } from './stock-list-reader';

describe('compact stock identity reads', () => {
  it('projects only missing canonical profiles and handles a single JSON object', async () => {
    const archived = {
      tsCode: '600001.SH',
      name: '退市公司',
      profile: { actName: '历史实控人' },
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          asOf: '2026-10-06',
          codes: JSON.stringify(['000001.SZ', '830001.BJ', '600001.SH']),
        },
      ])
      .mockResolvedValueOnce([{ stocks: JSON.stringify(archived) }]);
    const result = await readArchivedStocks(
      { query } as unknown as EntityManager,
      new Set(['000001.SZ', '920001.BJ']),
      (code) => (code === '830001.BJ' ? '920001.BJ' : code),
    );
    expect(result).toEqual({ asOf: '2026-10-06', stocks: [archived] });
    expect(query.mock.calls[1][1]).toEqual(['$.stocks[2]']);
  });

  it('does not request profile payload when all companies already exist or history is absent', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ asOf: '2026-10-06', codes: ['000001.SZ'] }]);
    expect(
      await readArchivedStocks(
        { query } as unknown as EntityManager,
        new Set(['000001.SZ']),
        (c) => c,
      ),
    ).toEqual({ asOf: '2026-10-06', stocks: [] });
    expect(query).toHaveBeenCalledTimes(1);
    query.mockResolvedValue([]);
    expect(
      await readArchivedStocks(
        { query } as unknown as EntityManager,
        new Set(),
        (c) => c,
      ),
    ).toEqual({ asOf: null, stocks: [] });
  });

  it('keeps every historical name attached to its original code, including BSE aliases', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        codes: ['830001.BJ', '000001.SZ', '830001.BJ'],
        names: ['曾用名', '平安', '另一个旧名'],
      },
    ]);
    expect(
      await readHistoricNames({ query } as unknown as EntityManager),
    ).toEqual([
      { tsCode: '830001.BJ', name: '曾用名' },
      { tsCode: '000001.SZ', name: '平安' },
      { tsCode: '830001.BJ', name: '另一个旧名' },
    ]);
    query.mockResolvedValue([{ codes: null, names: null }]);
    expect(
      await readHistoricNames({ query } as unknown as EntityManager),
    ).toEqual([]);
  });
});
