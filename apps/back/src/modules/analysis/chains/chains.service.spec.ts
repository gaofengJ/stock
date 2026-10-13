import { ChainsService } from './chains.service';

describe('published chain analysis', () => {
  const days = [
    { calDate: '2024-07-01', preTradeDate: '2024-06-28' },
    { calDate: '2024-07-02', preTradeDate: '2024-07-01' },
  ];

  function fixture() {
    const limits = {
      countTimes: jest.fn().mockResolvedValue([]),
      countAboveTimes: jest.fn().mockResolvedValue([]),
      limitUpAmount: jest.fn().mockResolvedValue([]),
      upgradeLimitUpAmount: jest.fn().mockResolvedValue([]),
    };
    const calendar = { list: jest.fn().mockResolvedValue({ items: days }) };
    const db = {
      query: jest.fn().mockResolvedValue([
        { date: '2024-06-28', state: 'missing' },
        { date: '2024-07-01', state: 'ready' },
        { date: '2024-07-02', state: 'pending' },
      ]),
    };
    return {
      limits,
      db,
      service: new ChainsService(limits as any, calendar as any, db as any),
    };
  }

  it.each([
    ['countLimitUpTimes', 'count'],
    ['countLimitUpAboveTimes', 'count'],
    ['limitUpAmount', 'totalAmount'],
    ['upgradeLimitUpAmount', 'totalAmount'],
    ['upgradeLimitUps1', 'rate'],
  ] as const)(
    '%s distinguishes a published zero from an unfinished trading day',
    async (method, field) => {
      const { db, service } = fixture();
      const rows = await service[method]({
        startDate: '2024-07-01',
        endDate: '2024-07-02',
        limitTimes: 1,
        upgradeNum: 1,
      });
      expect(rows).toEqual([
        { tradeDate: '2024-07-01', [field]: 0, state: 'ready' },
        { tradeDate: '2024-07-02', [field]: null, state: 'pending' },
      ]);
      expect(db.query).toHaveBeenCalledTimes(1);
    },
  );

  it('does not calculate an upgrade rate from a missing prior day', async () => {
    const { limits, service } = fixture();
    limits.countTimes.mockResolvedValueOnce([
      { tradeDate: '2024-07-01', count: 2 },
    ]);
    const rows = await service.upgradeLimitUps({
      startDate: '2024-07-01',
      endDate: '2024-07-02',
      upgradeNum: 2,
    });
    expect(rows[0]).toEqual({
      tradeDate: '2024-07-01',
      rate: null,
      state: 'missing',
    });
  });
});
