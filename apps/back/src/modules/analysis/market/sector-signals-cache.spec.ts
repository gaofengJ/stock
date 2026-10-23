import { MarketResearchService } from './market-research.service';

describe('sector signals result cache', () => {
  it('coalesces full computation and invalidates after source revision, policy or query changes', async () => {
    let revision = 1;
    let policies: any[] = [];
    const db = {
      query: jest.fn(async (sql: string) =>
        sql.includes('t_sync_run') ? [{ task: 'daily', revision }] : policies,
      ),
    };
    const service = new MarketResearchService(db as any, {} as any, {} as any);
    const compute = jest
      .spyOn(service as any, 'computeSectorSignals')
      .mockImplementation(async () => ({ items: [], revision }));
    const q = { date: '2026-10-22', scope: 'all' } as any;
    await Promise.all([service.sectorSignals(q), service.sectorSignals(q)]);
    expect(compute).toHaveBeenCalledTimes(1);
    revision = 2;
    await expect(service.sectorSignals(q)).resolves.toMatchObject({
      revision: 2,
    });
    expect(compute).toHaveBeenCalledTimes(2);
    policies = [{ trade_date: '2026-10-21' }];
    await service.sectorSignals(q);
    await service.sectorSignals({ ...q, code: '000001.SZ' });
    expect(compute).toHaveBeenCalledTimes(4);
  });
});
