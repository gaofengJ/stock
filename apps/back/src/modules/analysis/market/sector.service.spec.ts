/* eslint-disable no-await-in-loop, no-restricted-syntax -- 顺序验证异常快照不会覆盖已有数据。 */
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { DataSource } from 'typeorm';
import { LimitEntity } from '@/modules/source/limit/limit.entity';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { StrategyService } from '@/modules/strategy/strategy.service';
import { EStrategyType } from '@/modules/strategy/strategy.enum';
import { SectorService } from './sector.service';
import {
  SectorDailyEntity,
  SectorMembersEntity,
  SectorEntity,
} from './sector.entity';
import { BseMappingEntity } from './market.entity';
import { competitionRanks, primarySector, sectorReturn } from './sector.utils';

describe('同花顺板块数据与口径', () => {
  test('目录刷新通过真实 TypeORM 更新条件校验，随后保存完整新目录', async () => {
    const db = new DataSource({ type: 'mysql' });
    const builder: any = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };
    jest.spyOn(db.manager, 'createQueryBuilder').mockReturnValue(builder);
    await expect(
      db.manager.update(SectorEntity, {}, { active: false }),
    ).rejects.toThrow('Empty criteria');
    const tx = {
      update: db.manager.update.bind(db.manager),
      upsert: jest.fn(),
    };
    const manager: any = {
      findBy: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(null),
      transaction: (fn: any) => fn(tx),
    };
    const source = {
      queryData: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: ['ts_code', 'name', 'count', 'type'],
          items: [
            ['881101.TI', '行业', 20, 'I'],
            ['885001.TI', '概念', 30, 'N'],
          ],
        },
      }),
    };
    const service = new SectorService(
      {} as any,
      source as any,
      {} as any,
      { stage: (_m: any, _t: any, _d: any, run: any) => run() } as any,
    );
    await (service as any).catalog(manager, '2026-10-07');
    expect(builder.where).toHaveBeenCalledWith({ active: true });
    expect(tx.upsert).toHaveBeenCalledWith(
      SectorEntity,
      expect.arrayContaining([
        expect.objectContaining({ tsCode: '881101.TI', active: true }),
        expect.objectContaining({ tsCode: '885001.TI', active: true }),
      ]),
      ['tsCode'],
    );
  });
  test('排行保留原始小数精度，历史缺少精确基准日时不缩短计算周期', async () => {
    const dates = Array.from(
      { length: 21 },
      (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`,
    );
    const manager = {
      findBy: jest.fn().mockImplementation((entity) => {
        if (entity === SectorEntity)
          return [{ tsCode: '881101.TI', name: '行业', type: 'I' }];
        if (entity === LimitEntity) return [{ tsCode: '600000.SH' }];
        return [];
      }),
      find: jest.fn().mockImplementation((entity) => {
        if (entity === TradeCalEntity)
          return [...dates].reverse().map((calDate) => ({ calDate }));
        if (entity === DailyEntity)
          return [{ tsCode: '600000.SH', amount: '100', pctChg: '1.25' }];
        return [];
      }),
      findOneBy: jest.fn().mockResolvedValue({ status: 'success' }),
    };
    const db = {
      manager,
      query: jest.fn().mockImplementation((sql) => {
        if (sql.includes('FROM t_source_ths_daily'))
          return [
            {
              tsCode: '881101.TI',
              tradeDate: dates[20],
              close: '120.45',
              pctChange: '4.63',
            },
            {
              tsCode: '881101.TI',
              tradeDate: dates[15],
              close: '100.25',
              pctChange: '1.23',
            },
          ];
        if (sql.includes('FROM t_source_ths_members'))
          return [
            { tsCode: '881101.TI', asOf: '2026-10-01', codes: ['600000.SH'] },
          ];
        return [];
      }),
    };
    const r = await new SectorService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
    ).board({ date: dates[20], kind: 'I', days: 20, period: 1 } as any);
    expect(r.items[0].day).toBe(4.63);
    expect(r.items[0].five).toBeCloseTo((120.45 / 100.25 - 1) * 100);
    expect(r.items[0].twenty).toBeNull();
    expect(r.items[0].limitUp).toBe(1);
    expect(r.items[0].amount).toBe(0.001);
    expect(r.items[0].amountShare).toBe(100);
    expect(r.items[0].asOf).toBe('2026-10-01');
  });
  test('股票行业不回退到旧来源，策略筛选沿用同花顺成分关系', async () => {
    const service = new SectorService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'links').mockResolvedValue(new Map());
    expect(
      (
        await service.decorate([{ tsCode: '600000.SH', industry: '旧分类' }])
      )[0],
    ).toMatchObject({ industry: '', industries: [], topics: [] });
    jest.spyOn(service, 'board').mockResolvedValue({ items: [] } as any);
    jest.spyOn(service, 'codes').mockResolvedValue(new Set(['600000.SH']));
    const strategy = new StrategyService({} as any, {} as any, service);
    jest
      .spyOn(strategy, 'gapTwoUp')
      .mockResolvedValue([
        { tsCode: '600000.SH' },
        { tsCode: '000001.SZ' },
      ] as any);
    const result = await strategy.list({
      date: '2026-09-30',
      strategyType: EStrategyType.gapTwoUp,
      sector: '881101.TI',
    });
    expect(result.map((r) => r.tsCode)).toEqual(['600000.SH']);
    expect(service.codes).toHaveBeenCalledWith('881101.TI', '2026-09-30');
  });
  test('补充的板块背景查询失败不阻断策略选股', async () => {
    const service = new SectorService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(service, 'links').mockResolvedValue(new Map());
    jest.spyOn(service, 'board').mockRejectedValue(new Error('板块暂不可用'));
    const result = await service.candidateContext(
      [{ tsCode: '600000.SH' }],
      '2026-09-30',
    );
    expect(result).toEqual([
      {
        tsCode: '600000.SH',
        industry: '',
        industries: [],
        topics: [],
        sectorPerformance: [],
        sectorContextReady: false,
      },
    ]);
  });
  test('只纳入标准行业和实际概念，排除细分行业、其他分类和指数样本', () => {
    expect(primarySector({ tsCode: '881101.TI', type: 'I' })).toBe(true);
    expect(primarySector({ tsCode: '885540.TI', type: 'N' })).toBe(true);
    expect(primarySector({ tsCode: '886001.TI', type: 'N' })).toBe(true);
    for (const row of [
      { tsCode: '884001.TI', type: 'I' },
      { tsCode: '700301.TI', type: 'I' },
      { tsCode: '883001.TI', type: 'N' },
      { tsCode: '881101.TI', type: 'N' },
    ])
      expect(primarySector(row)).toBe(false);
  });
  test('缺少基准日不能被当作零收益，排名不包含缺失数据', () => {
    expect(sectorReturn(110, 100)).toBeCloseTo(10);
    for (const base of [null, undefined, 0, NaN])
      expect(sectorReturn(110, base)).toBeNull();
    expect([
      ...competitionRanks([
        { code: 'a', value: 10 },
        { code: 'b', value: 10 },
        { code: 'c', value: -1 },
        { code: 'd', value: null },
      ]),
    ]).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 3],
    ]);
  });
  function setup(fields: string[], items: unknown[][]) {
    const tx = { delete: jest.fn(), insert: jest.fn() };
    const manager = {
      find: jest
        .fn()
        .mockImplementation((entity) =>
          entity === BseMappingEntity
            ? [{ oldCode: '830001.BJ', newCode: '920001.BJ' }]
            : [],
        ),
      upsert: jest.fn(),
      transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    const source = {
      queryData: jest
        .fn()
        .mockResolvedValue({ code: 0, data: { fields, items } }),
    };
    const writes = { excluded: jest.fn().mockResolvedValue(false) };
    const sync = {
      stage: jest.fn().mockImplementation((_manager, _task, _date, fn) => fn()),
    };
    const service = new SectorService(
      { manager, hasMetadata: () => true } as any,
      source as any,
      writes as any,
      sync as any,
    );
    return { service, manager, tx };
  }
  test('成分只保留 A 股，北交所旧代码归一，不把新三板混入统计', async () => {
    const { service, manager } = setup(
      ['ts_code', 'con_code', 'con_name', 'is_new'],
      [
        ['885540.TI', '600000.SH', '浦发', 'Y'],
        ['885540.TI', '830001.BJ', '北交', 'Y'],
        ['885540.TI', '834683.NQ', '新三板', 'Y'],
      ],
    );
    await (service as any).members(
      manager,
      { tsCode: '885540.TI', name: '三胎概念', count: 3 },
      '2026-10-01',
    );
    expect(manager.upsert).toHaveBeenCalledWith(
      SectorMembersEntity,
      {
        asOf: '2026-10-01',
        tsCode: '885540.TI',
        members: [
          { code: '600000.SH', name: '浦发' },
          { code: '920001.BJ', name: '北交' },
        ],
      },
      ['asOf', 'tsCode'],
    );
  });

  test('目录验证完整后只撤下活跃目录，并在同一事务更新新目录', async () => {
    const selected = [
      { tsCode: '881101.TI', name: '行业', type: 'I', count: 2, active: true },
      { tsCode: '885540.TI', name: '概念', type: 'N', count: 3, active: true },
    ];
    const test = setup(
      ['ts_code', 'name', 'type', 'count'],
      [
        ['881101.TI', '行业', 'I', 2],
        ['885540.TI', '概念', 'N', 3],
      ],
    );
    const tx = {
      update: jest.fn().mockImplementation((_entity, criteria) => {
        if (!Object.keys(criteria).length) throw new Error('Empty criteria(s)');
      }),
      upsert: jest.fn(),
    };
    const manager = {
      ...test.manager,
      findBy: jest.fn().mockResolvedValueOnce([]).mockResolvedValue(selected),
      findOneBy: jest.fn().mockResolvedValue(null),
      transaction: jest.fn().mockImplementation((fn) => fn(tx)),
    };
    expect(await (test.service as any).catalog(manager, '2026-10-07')).toEqual(
      selected,
    );
    expect(tx.update).toHaveBeenCalledWith(
      SectorEntity,
      { active: true },
      { active: false },
    );
    expect(tx.upsert).toHaveBeenCalledWith(SectorEntity, selected, ['tsCode']);
  });

  test('目录快照不完整时不撤下旧目录', async () => {
    const test = setup(
      ['ts_code', 'name', 'type', 'count'],
      [['881101.TI', '行业', 'I', 2]],
    );
    const manager = {
      ...test.manager,
      findBy: jest
        .fn()
        .mockResolvedValue([{ tsCode: '885540.TI', active: true }]),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    await expect(
      (test.service as any).catalog(manager, '2026-10-07'),
    ).rejects.toThrow('目录不完整');
    expect(manager.transaction).not.toHaveBeenCalled();
  });
  test('成分覆盖异常不得覆盖旧快照', async () => {
    const { service, manager } = setup(
      ['ts_code', 'con_code', 'con_name'],
      [['885540.TI', '600000.SH', '浦发']],
    );
    await expect(
      (service as any).members(
        manager,
        { tsCode: '885540.TI', name: '三胎概念', count: 10 },
        '2026-10-01',
      ),
    ).rejects.toThrow('覆盖不足');
    expect(manager.upsert).not.toHaveBeenCalled();
  });
  test('日线日期错位或数值非法时保留原行情', async () => {
    for (const row of [
      ['881101.TI', '20260929', 100, 105, 95, 101, 100, 1, 123],
      ['881101.TI', '20260930', 100, 99, 95, 101, 100, 1, 123],
    ]) {
      const { service, manager, tx } = setup(
        [
          'ts_code',
          'trade_date',
          'open',
          'high',
          'low',
          'close',
          'pre_close',
          'pct_change',
          'vol',
        ],
        [row],
      );
      await expect(
        (service as any).daily(manager, '2026-09-30', [
          { tsCode: '881101.TI' },
        ]),
      ).rejects.toThrow();
      expect(tx.delete).not.toHaveBeenCalled();
    }
  });
  test('有效日线可以同步，新题材历史不存在不影响其他板块', async () => {
    const { service, manager, tx } = setup(
      [
        'ts_code',
        'trade_date',
        'open',
        'high',
        'low',
        'close',
        'pre_close',
        'pct_change',
        'vol',
      ],
      [
        ['881101.TI', '20260930', 100, 105, 95, 101, 100, 1, 123],
        ['886001.TI', '20260930', 1000, 1000, 1000, 1000, null, null, null],
      ],
    );
    await (service as any).daily(manager, '2026-09-30', [
      { tsCode: '881101.TI' },
      { tsCode: '886001.TI' },
    ]);
    expect(tx.delete).toHaveBeenCalledWith(SectorDailyEntity, {
      tradeDate: '2026-09-30',
    });
    expect(tx.insert).toHaveBeenCalledWith(SectorDailyEntity, [
      {
        tradeDate: '2026-09-30',
        tsCode: '881101.TI',
        data: {
          open: 100,
          high: 105,
          low: 95,
          close: 101,
          preClose: 100,
          pctChange: 1,
          vol: 123,
        },
      },
    ]);
  });
});
