import { StockService } from '@/modules/source/stock/stock.service';
import { LimitService } from '@/modules/source/limit/limit.service';
import { StrategyService } from '@/modules/strategy/strategy.service';
import { MarketService } from './market.service';
import { SectorService } from './sector.service';
import { sectorFilterCodes, withoutSectorClassification } from './sector.utils';

const raw = {
  tsCode: '600001.SH',
  name: '甲',
  industry: '旧来源行业',
  industries: [{ name: '旧行业' }],
  topics: [{ name: '旧概念' }],
  limitTimes: 1,
  tradeDate: '2026-09-30',
} as any;
const empty = { industry: '', industries: [], topics: [] };

it('removes all legacy classifications without mutating cached raw data', () => {
  expect(withoutSectorClassification(raw)).toMatchObject({
    ...empty,
    tsCode: raw.tsCode,
  });
  expect(raw.industry).toBe('旧来源行业');
});

it('stock and limit details never expose raw classifications when THS is unavailable', async () => {
  const repo = { findOneBy: jest.fn().mockResolvedValue(raw) } as any;
  expect(await new StockService(null!, repo).detail(1)).toMatchObject(empty);
  expect(await new LimitService(null!, repo).detail(1)).toMatchObject(empty);
});

it('market and cached screening results cannot leak non-THS labels', async () => {
  const db = {
    manager: { findOneBy: async () => ({}), findBy: async () => [raw] },
  } as any;
  const result = await new MarketService(db, null!).limits({
    date: '2026-09-30',
    type: 'U',
    scope: 'all',
  } as any);
  expect(result.items[0]).toMatchObject(empty);
  const strategy = new StrategyService(null!, null!);
  jest.spyOn(strategy as any, 'candidates').mockResolvedValue([raw]);
  expect(
    (
      await strategy.list({
        date: '2026-09-30',
        strategyType: 'test',
        includeLabels: false,
      } as any)
    )[0],
  ).toMatchObject(empty);
  expect(
    (
      await strategy.list({ date: '2026-09-30', strategyType: 'test' } as any)
    )[0],
  ).toMatchObject(empty);
});

it('THS membership replaces legacy industry, and missing membership stays empty', async () => {
  const service = new SectorService(null!, null!, null!, null!);
  jest.spyOn(service, 'links').mockResolvedValue(
    new Map([
      [
        raw.tsCode,
        [
          {
            code: '881101.TI',
            name: '同花顺行业',
            type: 'I',
            asOf: '2026-09-30',
          },
          {
            code: '885001.TI',
            name: '同花顺概念',
            type: 'N',
            asOf: '2026-09-30',
          },
        ],
      ],
    ]),
  );
  const result = await service.decorate([raw, { ...raw, tsCode: '600002.SH' }]);
  expect(result[0].industry).toBe('同花顺行业');
  expect(result[0].topics[0].name).toBe('同花顺概念');
  expect(result[1]).toMatchObject(empty);
});

it('fails explicitly rather than silently ignoring a THS sector filter', async () => {
  expect(() => sectorFilterCodes(undefined, '885001.TI')).toThrow(
    '同花顺分类服务',
  );
  expect(await sectorFilterCodes(undefined)).toBeNull();
});
