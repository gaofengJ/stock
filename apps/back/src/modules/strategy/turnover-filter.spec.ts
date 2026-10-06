import { StrategyService } from './strategy.service';
import { StrategyCacheService } from './strategy-cache.service';

describe('independent turnover query and cache parameters', () => {
  test.each([
    ['gapThreeUp', 'findGapThreeUp'],
    ['gapTwoUp', 'findGapTwoUp'],
    ['gapThreeHighTurnover', 'findGapThreeHighTurnover'],
    ['threeDaysHighVol', 'findThreeDaysHighVol'],
    ['continuousGap', 'findContinuousGap'],
    ['shadowWrap', 'findShadowWrap'],
  ])(
    '%s passes user thresholds to its evaluator and separates cached results',
    async (strategyType, method) => {
      const db: any = { query: jest.fn().mockResolvedValue([]) };
      const daily: any = {
        [method]: jest
          .fn()
          .mockImplementation(async (_dates, _sequence, minimum) => [
            { tsCode: '000001.SZ', minimum },
          ]),
      };
      const calendar: any = {
        isOpen: jest.fn().mockResolvedValue(true),
        getLastNDays: jest.fn().mockResolvedValue([{ calDate: '2026-09-30' }]),
      };
      const service = new StrategyService(
        calendar,
        daily,
        undefined,
        undefined,
        new StrategyCacheService(db),
      );
      const query = { date: '2026-09-30', strategyType, includeLabels: false };
      expect(await service.list(query)).toMatchObject([{ minimum: 5 }]);
      expect(
        await service.list({ ...query, minTurnoverRateF: 8 }),
      ).toMatchObject([{ minimum: 8 }]);
      expect(
        await service.list({ ...query, minTurnoverRateF: 0 }),
      ).toMatchObject([{ minimum: 0 }]);
      expect(await service.list(query)).toMatchObject([{ minimum: 5 }]);
      expect(daily[method]).toHaveBeenCalledTimes(3);
    },
  );
});
