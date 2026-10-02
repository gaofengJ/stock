import 'reflect-metadata';
import { ACCESS } from '@/modules/auth/permissions';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { MarketResearchService } from './market-research.service';
import { MarketController } from './market.controller';
import { SectorService } from './sector.service';
import { BseMappingEntity } from './market.entity';

describe('策略关联范围和就绪状态', () => {
  const dates = ['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-25'];
  function setup(complete: boolean) {
    const manager = {
      find: jest.fn().mockImplementation((entity) => {
        if (entity === TradeCalEntity)
          return dates.map((calDate) => ({ calDate }));
        if (entity === SyncRunEntity)
          return (complete ? dates : dates.slice(0, 3)).map((tradeDate) => ({
            tradeDate,
            updatedAt: new Date('2026-09-30'),
          }));
        if (entity === BseMappingEntity)
          return [{ oldCode: '830001.BJ', newCode: '920001.BJ' }];
        return [];
      }),
    };
    const daily = {
      strategyHistory: jest.fn().mockResolvedValue([
        {
          date: dates[0],
          complete: true,
          hits: new Map([
            ['600001.SH', ['gapTwoUp']],
            ['830001.BJ', ['continuousGap']],
          ]),
        },
      ]),
    };
    return {
      daily,
      service: new MarketResearchService(
        {
          manager,
          query: jest
            .fn()
            .mockResolvedValue([
              { tsCode: '600001.SH' },
              { tsCode: '830001.BJ' },
            ]),
        } as any,
        daily as any,
        {} as any,
      ),
    };
  }
  test('缺一个基准日不显示未命中，不扫描全市场日线', async () => {
    const { service, daily } = setup(false);
    const result = await service.signals({
      date: dates[0],
      scope: 'all',
    } as any);
    expect(result.readyDates).toEqual([]);
    expect(result.items).toEqual([]);
    expect(daily.strategyHistory).not.toHaveBeenCalled();
  });
  test('按范围过滤并统一北交所代码，同一窗口不同范围共用一次计算', async () => {
    const { service, daily } = setup(true);
    const bj = await service.signals({ date: dates[0], scope: 'bj' } as any);
    expect(bj.items).toEqual([
      { date: dates[0], tsCode: '920001.BJ', strategies: ['continuousGap'] },
    ]);
    const hs = await service.signals({ date: dates[0], scope: 'hs' } as any);
    expect(hs.items.map((r) => r.tsCode)).toEqual(['600001.SH']);
    expect(daily.strategyHistory).toHaveBeenCalledTimes(1);
  });
  test('北交所新旧代码同时存在时合并策略，股票只返回一次', async () => {
    const { service, daily } = setup(true);
    daily.strategyHistory.mockResolvedValue([
      {
        date: dates[0],
        complete: true,
        hits: new Map([
          ['830001.BJ', ['continuousGap']],
          ['920001.BJ', ['gapTwoUp', 'continuousGap']],
        ]),
      },
    ]);
    const result = await service.signals({
      date: dates[0],
      scope: 'bj',
    } as any);
    expect(result.items).toEqual([
      {
        date: dates[0],
        tsCode: '920001.BJ',
        strategies: ['continuousGap', 'gapTwoUp'],
      },
    ]);
  });
  test('策略命中接口独立要求策略权限，不能借市场分析权限读取', () => {
    (['signals', 'sectorSignals', 'environment'] as const).forEach((method) => {
      expect(
        Reflect.getMetadata(ACCESS, MarketController.prototype[method]),
      ).toEqual({ any: ['strategy:read'] });
    });
  });
  test('新策略独立就绪，旧策略缺数据时不隐藏已完成的新策略命中', async () => {
    const { service } = setup(false);
    const trends = {
      history: jest.fn().mockResolvedValue({
        readyByStrategy: {
          volumeBreakout: [dates[0]],
          breakoutPullback: [],
          fiveMaUp: [],
        },
        items: [
          {
            date: dates[0],
            key: 'volumeBreakout',
            rows: [{ tsCode: '600001.SH' }],
          },
        ],
      }),
    };
    (service as any).trends = trends;
    const result = await service.signals({
      date: dates[0],
      scope: 'hs',
    } as any);
    expect(result.readyDates).toEqual([]);
    expect(result.readyByStrategy).toMatchObject({
      gapTwoUp: [],
      volumeBreakout: [dates[0]],
      fiveMaUp: [],
    });
    expect(result.items).toEqual([
      { date: dates[0], tsCode: '600001.SH', strategies: ['volumeBreakout'] },
    ]);
    expect(trends.history).toHaveBeenCalledWith(
      [dates[0]],
      ['volumeBreakout', 'breakoutPullback', 'fiveMaUp'],
      {},
      undefined,
    );
  });
  test('新旧策略共同命中同一股票合并显示，趋势标记保持默认参数', async () => {
    const { service } = setup(true);
    (service as any).trends = {
      history: jest.fn().mockResolvedValue({
        readyByStrategy: { fiveMaUp: [dates[0]] },
        items: [
          { date: dates[0], key: 'fiveMaUp', rows: [{ tsCode: '600001.SH' }] },
        ],
      }),
    };
    const result = await service.signals({
      date: dates[0],
      scope: 'hs',
      code: '600001.SH',
    } as any);
    expect(result.items).toEqual([
      {
        date: dates[0],
        tsCode: '600001.SH',
        strategies: ['gapTwoUp', 'fiveMaUp'],
      },
    ]);
  });
  test('板块命中数按股票去重，逐策略数量仍保留；无命中为0', async () => {
    const service = new SectorService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'snapshots').mockResolvedValue([
      {
        tsCode: '881101.TI',
        asOf: dates[0],
        members: [
          { code: '600001.SH', name: '一' },
          { code: '600001.SH', name: '一' },
          { code: '000001.SZ', name: '二' },
        ],
      },
      {
        tsCode: '885001.TI',
        asOf: dates[0],
        members: [{ code: '600002.SH', name: '三' }],
      },
    ]);
    const result = await service.signalCounts(
      dates[0],
      new Map([
        ['600001.SH', ['gapTwoUp', 'continuousGap']],
        ['000001.SZ', ['gapTwoUp']],
      ]),
    );
    expect(result[0]).toEqual({
      code: '881101.TI',
      count: 2,
      strategies: [
        { key: 'gapTwoUp', count: 2 },
        { key: 'continuousGap', count: 1 },
      ],
    });
    expect(result[1]).toEqual({ code: '885001.TI', count: 0, strategies: [] });
  });
});
