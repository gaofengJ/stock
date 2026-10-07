import { DataSource } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { MarketBreadthService } from './market-breadth.service';
import { MarketSyncService } from './market-sync.service';
import { BseMappingEntity, MarketBreadthEntity } from './market.entity';

describe('均线广度独立同步', () => {
  const date = '2026-09-30';
  const make = (items: unknown[][]) => {
    const tx = { delete: jest.fn(), insert: jest.fn() };
    const manager = {
      countBy: jest.fn().mockResolvedValue(0),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockImplementation((entity) => {
        if (entity === DailyEntity)
          return [
            { tsCode: '830001.BJ', amount: 100 },
            { tsCode: '600000.SH', amount: 100 },
          ];
        if (entity === BseMappingEntity)
          return [{ oldCode: '830001.BJ', newCode: '920001.BJ' }];
        if (entity === TradeCalEntity)
          return Array.from({ length: 60 }, (_, i) => ({
            calDate: i ? '2026-01-01' : date,
          }));
        return [];
      }),
      findBy: jest.fn().mockImplementation((entity) =>
        entity === DailyEntity
          ? [
              { tsCode: '830001.BJ', amount: 100 },
              { tsCode: '600000.SH', amount: 100 },
            ]
          : [],
      ),
      transaction: jest.fn().mockImplementation((action) => action(tx)),
    };
    const source = {
      queryData: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: [
            'ts_code',
            'trade_date',
            'close_hfq',
            'ma_hfq_20',
            'ma_hfq_60',
          ],
          items,
        },
      }),
    };
    const sync = {
      complete: jest.fn().mockResolvedValue(true),
      stage: jest
        .fn()
        .mockImplementation((_manager, _task, _date, action) => action()),
    };
    const writes = { excluded: jest.fn().mockResolvedValue(false) };
    const service = new MarketBreadthService(
      {} as DataSource,
      source as unknown as TushareService,
      writes as unknown as SyncWriteService,
      sync as unknown as MarketSyncService,
    );
    return { service, manager, tx, source, sync, writes };
  };

  it('北交所新旧代码统一，并在独立事务中一次提交六个范围', async () => {
    const test = make([
      ['920001.BJ', '20260930', 10, 9, 11],
      ['600000.SH', '20260930', 10, 9, 11],
    ]);
    await test.service.syncDay(test.manager as any, date);
    const rows = test.tx.insert.mock.calls[0][1];
    expect(rows).toHaveLength(6);
    expect(rows.find((r: any) => r.scope === 'bj').data.ma20).toMatchObject({
      above: 1,
      eligible: 1,
      ratio: 100,
    });
    expect(test.tx.delete).toHaveBeenCalledWith(MarketBreadthEntity, {
      tradeDate: date,
    });
    expect(test.source.queryData).toHaveBeenCalledWith(
      'stk_factor_pro',
      { trade_date: '20260930' },
      'ts_code,trade_date,close_hfq,ma_hfq_20,ma_hfq_60',
      10000,
    );
  });

  it.each([
    [['600000.SH', '20260929', 10, 9, 11]],
    [['600000.SH', '20260930', 10, 9, 11]],
    [
      ['600000.SH', '20260930', 10, 9, 11],
      ['600000.SH', '20260930', 10, 9, 11],
    ],
  ])('日期、市场覆盖或代码重复异常不触碰旧汇总 (%#)', async (...items) => {
    const test = make(items);
    await expect(
      test.service.syncDay(test.manager as any, date),
    ).rejects.toThrow();
    expect(test.manager.transaction).not.toHaveBeenCalled();
  });

  it('合并数值相同的北交所新旧代码，样本不会重复计数', async () => {
    const test = make([
      ['830001.BJ', '20260930', 10, 9, 11],
      ['920001.BJ', '20260930', 10, 9, 11],
      ['600000.SH', '20260930', 10, 9, 11],
    ]);
    const find = test.manager.find.getMockImplementation()!;
    test.manager.find.mockImplementation((entity, options) =>
      entity === DailyEntity
        ? [...find(entity, options), { tsCode: '920001.BJ', amount: 100 }]
        : find(entity, options),
    );
    await test.service.syncDay(test.manager as any, date);
    const rows = test.tx.insert.mock.calls[0][1];
    expect(rows.find((r: any) => r.scope === 'bj').data.total).toBe(1);
    expect(rows.find((r: any) => r.scope === 'bj').data.ma20.eligible).toBe(1);
  });

  it.each([false, true])(
    '新旧代码判断不同也以新代码的整条复权记录为准，返回顺序不影响结果 (%s)',
    async (reverse) => {
      const pair = [
        ['830001.BJ', '20260930', 10, 9, 11],
        ['920001.BJ', '20260930', 12, 13, 10],
      ];
      const test = make([
        ...(reverse ? pair.reverse() : pair),
        ['600000.SH', '20260930', 10, 9, 11],
      ]);
      await test.service.syncDay(test.manager as any, date);
      const rows = test.tx.insert.mock.calls[0][1];
      expect(rows.find((r: any) => r.scope === 'bj').data).toMatchObject({
        total: 1,
        ma20: { eligible: 1, above: 0, ratio: 0 },
        ma60: { eligible: 1, above: 1, ratio: 100 },
      });
    },
  );

  it.each([false, true])(
    '不同复权基点但比例一致的新旧代码只计一次，返回顺序不影响结果 (%s)',
    async (reverse) => {
      const pair = [
        ['830001.BJ', '20260930', 5.72865, 5.53317, 5.12253],
        ['920001.BJ', '20260930', 4.78042, 4.61729, 4.27462],
      ];
      const test = make([
        ...(reverse ? pair.reverse() : pair),
        ['600000.SH', '20260930', 10, 9, 11],
      ]);
      await test.service.syncDay(test.manager as any, date);
      const rows = test.tx.insert.mock.calls[0][1];
      expect(rows.find((r: any) => r.scope === 'bj').data).toMatchObject({
        total: 1,
        ma20: { eligible: 1, above: 1, ratio: 100 },
        ma60: { eligible: 1, above: 1, ratio: 100 },
      });
    },
  );

  it.each([false, true])(
    '历史复权比例的微小精度差不阻断新代码的数据发布 (%s)',
    async (reverse) => {
      const pair = [
        ['830001.BJ', '20260930', 1086.1189, 1133.97527, 1093.41958],
        ['920001.BJ', '20260930', 185.95386, 194.14733, 187.20391],
      ];
      const test = make([
        ...(reverse ? pair.reverse() : pair),
        ['600000.SH', '20260930', 10, 9, 11],
      ]);
      await test.service.syncDay(test.manager as any, date);
      const rows = test.tx.insert.mock.calls[0][1];
      expect(rows.find((r: any) => r.scope === 'bj').data).toMatchObject({
        total: 1,
        ma20: { eligible: 1, above: 0, ratio: 0 },
        ma60: { eligible: 1, above: 0, ratio: 0 },
      });
    },
  );

  it('历史日期仅有旧代码时使用同条记录内的价格和均线', async () => {
    const test = make([
      ['830001.BJ', '20260930', 10, 9, 11],
      ['600000.SH', '20260930', 10, 9, 11],
    ]);
    await test.service.syncDay(test.manager as any, date);
    const rows = test.tx.insert.mock.calls[0][1];
    expect(rows.find((r: any) => r.scope === 'bj').data).toMatchObject({
      total: 1,
      ma20: { eligible: 1, above: 1 },
      ma60: { eligible: 1, above: 0 },
    });
  });

  it('新代码无有效价格时不能用旧代码掩盖覆盖不足，旧汇总保留', async () => {
    const test = make([
      ['830001.BJ', '20260930', 10, 9, 11],
      ['920001.BJ', '20260930', 0, 9, 11],
      ['600000.SH', '20260930', 10, 9, 11],
    ]);
    await expect(
      test.service.syncDay(test.manager as any, date),
    ).rejects.toThrow('覆盖不足95%');
    expect(test.manager.transaction).not.toHaveBeenCalled();
  });

  it('新代码缺少单条均线时保留不足状态，不拼接旧代码的均线', async () => {
    const test = make([
      ['830001.BJ', '20260930', 10, 9, 11],
      ['920001.BJ', '20260930', 12, null, 10],
      ['600000.SH', '20260930', 10, 9, 11],
    ]);
    await test.service.syncDay(test.manager as any, date);
    const rows = test.tx.insert.mock.calls[0][1];
    expect(rows.find((r: any) => r.scope === 'bj').data).toMatchObject({
      total: 1,
      ma20: { eligible: 0, insufficient: 1, ratio: null },
      ma60: { eligible: 1, above: 1, ratio: 100 },
    });
  });

  it('新代码本身重复仍拒绝发布', async () => {
    const test = make([
      ['830001.BJ', '20260930', 10, 9, 11],
      ['920001.BJ', '20260930', 12, 13, 10],
      ['920001.BJ', '20260930', 12, 13, 10],
      ['600000.SH', '20260930', 10, 9, 11],
    ]);
    await expect(
      test.service.syncDay(test.manager as any, date),
    ).rejects.toThrow('均线数据代码重复');
    expect(test.manager.transaction).not.toHaveBeenCalled();
  });

  it('三个历史冲突日不能阻断其他日期补齐，新日期仍优先', async () => {
    const rows = [
      { date: '2025-04-30', failed: 1 },
      { date: '2025-04-29', failed: 1 },
      { date: '2025-04-28', failed: 1 },
      { date: '2025-04-25', failed: 0 },
      { date: '2025-04-24', failed: 0 },
      { date: '2026-09-30', failed: 0 },
    ];
    const manager = { query: jest.fn().mockResolvedValue(rows) };
    const service = new MarketBreadthService(
      {} as any,
      {} as any,
      { withLock: (fn: any) => fn(manager) } as any,
      {} as any,
    );
    const sync = jest.spyOn(service, 'syncDay').mockResolvedValue(undefined);
    expect(await service.batch('2024-09-30', date)).toMatchObject({
      completed: ['2026-09-30', '2025-04-25', '2025-04-24'],
      remaining: 3,
      failures: [],
    });
    expect(sync.mock.calls.map((call) => call[1])).toEqual([
      '2026-09-30',
      '2025-04-25',
      '2025-04-24',
    ]);
    manager.query.mockResolvedValue(rows.slice(0, 3));
    sync.mockRejectedValue(new Error('北交所新旧代码均线数值冲突'));
    expect(await service.batch('2024-09-30', date)).toMatchObject({
      completed: [],
      remaining: 3,
      failures: rows
        .slice(0, 3)
        .map((r) => `${r.date}: 北交所新旧代码均线数值冲突`),
    });
  });

  it('主动删除保护或核心行情未完整时不请求数据源', async () => {
    const test = make([]);
    test.writes.excluded.mockResolvedValue(true);
    await expect(
      test.service.syncDay(test.manager as any, date),
    ).rejects.toThrow('保护');
    test.writes.excluded.mockResolvedValue(false);
    test.sync.complete.mockResolvedValue(false);
    await expect(
      test.service.syncDay(test.manager as any, date),
    ).rejects.toThrow('完整');
    expect(test.source.queryData).not.toHaveBeenCalled();
  });

  it('技术均线整列无效时不能发布为零或均线不足', async () => {
    const test = make([
      ['920001.BJ', '20260930', 10, null, 11],
      ['600000.SH', '20260930', 10, null, 11],
    ]);
    await expect(
      test.service.syncDay(test.manager as any, date),
    ).rejects.toThrow('整列');
    expect(test.manager.transaction).not.toHaveBeenCalled();
  });
});
