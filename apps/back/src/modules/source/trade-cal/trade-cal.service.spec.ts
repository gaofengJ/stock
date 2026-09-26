import { TradeCalService } from './trade-cal.service';

describe('trade calendar availability', () => {
  it('reports missing calendar data instead of claiming the market was closed', async () => {
    const repository = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new TradeCalService({} as any, repository as any);
    await expect(service.isOpen('2026-09-24')).rejects.toMatchObject({
      response: {
        code: '-2007',
        message: '当前数据库缺少该日期的交易日历，请先补齐数据',
      },
    });
  });

  it.each([
    [1, true],
    [0, false],
  ])(
    'respects an existing calendar record with isOpen=%s',
    async (isOpen, expected) => {
      const repository = { findOne: jest.fn().mockResolvedValue({ isOpen }) };
      const service = new TradeCalService({} as any, repository as any);
      await expect(service.isOpen('2026-09-24')).resolves.toBe(expected);
    },
  );
});
