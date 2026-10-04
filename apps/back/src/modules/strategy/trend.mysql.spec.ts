import 'reflect-metadata';
import { Connection, createConnection } from 'mysql2/promise';
import { DataSource } from 'typeorm';
import { StrategyTrend1791417600000 } from '@/migrations/1791417600000-StrategyTrend';
import { DailyEntity } from '@/modules/source/daily/daily.entity';
import { StockIdentityService } from '@/modules/source/stock/stock-identity.service';
import { TradeCalEntity } from '@/modules/source/trade-cal/trade-cal.entity';
import { BseMappingEntity } from '@/modules/analysis/market/market.entity';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { SyncDayPolicyEntity } from '@/modules/daily-task/sync-day-policy.entity';
import { SyncWriteService } from '@/modules/daily-task/sync-write.service';
import { StockHistoryEntity } from '@/modules/source/stock/stock-history.entity';
import { TrendService } from './trend.service';
import { TrendFactorEntity } from './trend.entity';
import { StrategyCacheService } from './strategy-cache.service';

const mysqlDescribe = process.env.SYNC_TEST_MYSQL_PORT
  ? describe
  : describe.skip;
mysqlDescribe('趋势策略 MySQL 快照与发布就绪', () => {
  let admin: Connection;
  let db: DataSource;
  let service: TrendService;
  const database = `stock_trend_test_${process.pid}_${Date.now()}`;
  const dates = Array.from(
    { length: 21 },
    (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`,
  );
  const latest = dates[20];
  const identity = {
    load: jest.fn(),
    assertReady: jest.fn(),
  };
  const index = {
    canonical: (code: string) => (code === '830001.BJ' ? '920001.BJ' : code),
    expand: (codes: string[]) => codes,
    listed: jest.fn().mockReturnValue(true),
    name: jest.fn().mockReturnValue('正常股票'),
  };
  const source = { queryData: jest.fn() };
  const response = (open = 10) => ({
    code: 0,
    data: {
      fields: [
        'ts_code',
        'trade_date',
        'open_hfq',
        'close_hfq',
        'high_hfq',
        'low_hfq',
      ],
      items: [['000001.SZ', latest.replace(/-/g, ''), open, 11, 12, 10]],
    },
  });
  beforeAll(async () => {
    const connection = {
      host: '127.0.0.1',
      port: Number(process.env.SYNC_TEST_MYSQL_PORT),
      user: 'root',
      password: process.env.SYNC_TEST_MYSQL_PASSWORD || '',
    };
    admin = await createConnection(connection);
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4`);
    db = new DataSource({
      type: 'mysql',
      host: connection.host,
      port: connection.port,
      username: connection.user,
      password: connection.password,
      database,
      timezone: 'Z',
      synchronize: true,
      entities: [
        DailyEntity,
        TradeCalEntity,
        BseMappingEntity,
        SyncRunEntity,
        SyncDayPolicyEntity,
        TrendFactorEntity,
        StockHistoryEntity,
      ],
    });
    await db.initialize();
    await db.query('DROP TABLE t_source_strategy_factor');
    const runner = db.createQueryRunner();
    try {
      await new StrategyTrend1791417600000().up(runner);
      await new StrategyTrend1791417600000().up(runner);
    } finally {
      await runner.release();
    }
    service = new TrendService(
      db,
      source as any,
      identity as any,
      new SyncWriteService(db),
    );
  });
  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
    if (admin) {
      await admin.query(`DROP DATABASE \`${database}\``);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await Promise.all(
      [
        DailyEntity,
        TradeCalEntity,
        BseMappingEntity,
        SyncRunEntity,
        SyncDayPolicyEntity,
        TrendFactorEntity,
      ].map((entity) => db.manager.clear(entity)),
    );
    index.listed.mockReturnValue(true);
    index.name.mockReturnValue('正常股票');
    identity.load.mockResolvedValue(index);
    identity.assertReady.mockImplementation((days) =>
      StockIdentityService.prototype.assertReady.call({ db } as any, days),
    );
    source.queryData.mockReset();
    source.queryData.mockResolvedValue(response());
    await db.manager.insert(
      TradeCalEntity,
      dates.map((calDate, i) => ({
        calDate,
        isOpen: 1,
        preTradeDate: dates[i - 1] || '2025-12-31',
        exchange: 'SSE',
      })),
    );
    await db.manager.insert(
      DailyEntity,
      dates.map((tradeDate, i) => ({
        tradeDate,
        tsCode: '000001.SZ',
        name: '当前名称不用作历史依据',
        open: i === 20 ? '10' : '8.9',
        close: i === 20 ? '11' : '9',
        high: i === 20 ? '12' : '10',
        low: i === 20 ? '10' : '8',
        preClose: '9',
        change: '1',
        pctChg: '1',
        upLimit: '20',
        downLimit: '8',
        vol: i === 20 ? '150' : '100',
        amount: '60000',
      })),
    );
    await db.manager.insert(
      SyncRunEntity,
      dates.flatMap((tradeDate) => [
        { task: 'daily', tradeDate, status: 'success' as const, dailyCount: 1 },
        {
          task: 'strategy-factor',
          tradeDate,
          status: 'success' as const,
          updatedAt: new Date('2020-01-01'),
        },
      ]),
    );
    await db.manager.insert(
      TrendFactorEntity,
      dates.map((tradeDate, i) => ({
        tradeDate,
        data: [
          ['000001.SZ', ...(i === 20 ? [10, 11, 12, 10] : [8.9, 9, 10, 8])],
        ] as any,
      })),
    );
  });
  test('新增表JSON及日期正确往返，真实计算命中并保留证据', async () => {
    const result = await service.list(latest, 'volumeBreakout');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: '正常股票',
      tradeDate: latest,
      trendEvidence: {
        strategy: 'volumeBreakout',
        breakoutPrice: 10,
        volumeMultiple: 1.5,
      },
    });
  });
  test('缓存版本查询兼容实际数据库，修复或保护行情后立即失效', async () => {
    const cache = new StrategyCacheService(db);
    const loader = jest.fn().mockResolvedValue([{ tsCode: '000001.SZ' }]);
    await cache.read(latest, { key: 'volumeBreakout' }, loader);
    await cache.read(latest, { key: 'volumeBreakout' }, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    await db.manager.insert(SyncDayPolicyEntity, {
      tradeDate: latest,
      reason: 'manual-delete',
    });
    await cache.read(latest, { key: 'volumeBreakout' }, loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });
  test('缺少快照不等于未命中，每个策略独立报告就绪', async () => {
    const result = await service.history([latest]);
    expect(result.readyByStrategy).toEqual({
      volumeBreakout: [latest],
      breakoutPullback: [],
      fiveMaUp: [],
    });
    await db.manager.delete(TrendFactorEntity, { tradeDate: dates[0] });
    await expect(service.list(latest, 'volumeBreakout')).rejects.toThrow(
      '尚未补齐',
    );
  });
  test('历史窗口保留不满足收盘位置的基准日成交量，与单日突破一致', async () => {
    await db.manager.update(
      DailyEntity,
      { tradeDate: dates[19] },
      { close: '8.5' },
    );
    const single = await service.list(latest, 'volumeBreakout');
    const history = await service.history(dates.slice(-2), ['volumeBreakout']);
    expect(single).toHaveLength(1);
    expect(history.items.find((r) => r.date === latest)?.rows).toEqual(single);
  });
  test('回踩日收在下半区仍须保留量能，历史与单日回踩一致', async () => {
    const samples = [
      [17, 10, 11, 11, 10, 150],
      [18, 10.5, 10.1, 10.6, 9.9, 100],
      [19, 10.2, 10.1, 10.4, 10, 100],
      [20, 10.2, 10.5, 10.6, 10, 110],
    ];
    await Promise.all(
      samples.map(async ([i, open, close, high, low, vol]) => {
        await db.manager.update(
          DailyEntity,
          { tradeDate: dates[i] },
          {
            open: String(open),
            close: String(close),
            high: String(high),
            low: String(low),
            vol: String(vol),
          },
        );
        await db.manager.update(
          TrendFactorEntity,
          { tradeDate: dates[i] },
          { data: [['000001.SZ', open, close, high, low]] },
        );
      }),
    );
    const options = { breakoutDays: 5, volumeDays: 3 };
    const single = await service.list(latest, 'breakoutPullback', options);
    const history = await service.history(
      dates.slice(-4),
      ['breakoutPullback'],
      options,
    );
    expect(single).toHaveLength(1);
    expect(history.items.find((r) => r.date === latest)?.rows).toEqual(single);
  });
  test('个股图表沿用策略复权口径、信号证据与成交量，不读取未来', async () => {
    const chart = await service.chart({
      date: latest,
      code: '000001.SZ',
      strategyType: 'volumeBreakout',
    });
    expect(chart.basis).toBe('后复权');
    expect(chart.series).toHaveLength(21);
    expect(chart.series.at(-1)).toMatchObject({
      date: latest,
      open: 10,
      close: 11,
      vol: 150,
    });
    expect(chart.evidence).toMatchObject({ breakoutPrice: 10 });
    const legacy = await service.chart({
      date: dates[19],
      code: '000001.SZ',
      strategyType: 'gapTwoUp',
    });
    expect(legacy.basis).toBe('不复权');
    expect(legacy.series.every((r) => r.date <= dates[19])).toBe(true);
  });
  test('某一天原始日线被部分删除，不能继续发布完整结果', async () => {
    await db.manager.delete(DailyEntity, { tradeDate: dates[19] });
    await expect(service.list(latest, 'volumeBreakout')).rejects.toThrow(
      '未同步完整',
    );
  });
  test('主动删除保护涵盖整个复权窗口，后台同步也不能恢复保护日期', async () => {
    await db.manager.insert(SyncDayPolicyEntity, {
      tradeDate: dates[0],
      reason: 'manual-delete',
    });
    await expect(service.list(latest, 'volumeBreakout')).rejects.toThrow(
      '尚未补齐',
    );
    await expect(service.syncDay(db.manager, dates[0])).rejects.toThrow('保护');
  });
  test('IPO历史不足和来源明确缺价跳过，意外缺少已上市股票则报错', async () => {
    await db.manager.update(
      TrendFactorEntity,
      { tradeDate: dates[0] },
      { data: [] },
    );
    await expect(service.list(latest, 'volumeBreakout')).rejects.toThrow(
      '复权行情缺失',
    );
    index.listed.mockReturnValue(false);
    expect(await service.list(latest, 'volumeBreakout')).toEqual([]);
    index.listed.mockReturnValue(true);
    await db.manager.update(
      TrendFactorEntity,
      { tradeDate: dates[0] },
      { data: [['000001.SZ', null, null, null, null]] },
    );
    expect(await service.list(latest, 'volumeBreakout')).toEqual([]);
  });
  test('历史ST不使用当前普通名称，缺少历史名称明确报错', async () => {
    index.name.mockReturnValue('ST股票');
    expect(await service.list(latest, 'volumeBreakout')).toEqual([]);
    index.name.mockReturnValue('');
    await expect(service.list(latest, 'volumeBreakout')).rejects.toThrow(
      '历史股票名称缺失',
    );
  });
  test('来源不返回停牌因子时，完整原始日线中的零值占位明确排除该股票', async () => {
    await db.manager.update(
      TrendFactorEntity,
      { tradeDate: dates[0] },
      { data: [] },
    );
    await db.manager.update(
      DailyEntity,
      { tradeDate: dates[0] },
      { open: '0', close: '0', high: '0', low: '0', vol: '0' },
    );
    expect(await service.list(latest, 'volumeBreakout')).toEqual([]);
    await db.manager.update(
      SyncRunEntity,
      { task: 'daily', tradeDate: dates[0] },
      { status: 'pending' },
    );
    await expect(service.list(latest, 'volumeBreakout')).rejects.toThrow(
      '未同步完整',
    );
  });
  test('同步失败保留旧快照，失败重试复用同步记录并能恢复成功', async () => {
    source.queryData.mockResolvedValueOnce(response(100));
    await expect(service.syncDay(db.manager, latest, true)).rejects.toThrow(
      '四价异常',
    );
    expect(
      (
        await db.manager.findOneByOrFail(TrendFactorEntity, {
          tradeDate: latest,
        })
      ).data[0][1],
    ).toBe(10);
    await db.manager.update(
      SyncRunEntity,
      { task: 'strategy-factor', tradeDate: latest },
      { updatedAt: new Date('2020-01-01') },
    );
    await service.syncDay(db.manager, latest);
    expect(
      await db.manager.countBy(SyncRunEntity, {
        task: 'strategy-factor',
        tradeDate: latest,
      }),
    ).toBe(1);
    expect(
      await db.manager.findOneBy(SyncRunEntity, {
        task: 'strategy-factor',
        tradeDate: latest,
      }),
    ).toMatchObject({ status: 'success' });
    expect(await service.list(latest, 'volumeBreakout')).toHaveLength(1);
  });
  test('北交所新旧代码行情冲突拒绝覆盖', async () => {
    await db.manager.insert(BseMappingEntity, {
      oldCode: '830001.BJ',
      newCode: '920001.BJ',
    });
    const data = response();
    data.data.items = [
      ['830001.BJ', '20260121', 10, 11, 12, 10],
      ['920001.BJ', '20260121', 10, 11.1, 12, 10],
    ];
    source.queryData.mockResolvedValue(data);
    await expect(service.syncDay(db.manager, latest, true)).rejects.toThrow(
      '新旧代码复权行情冲突',
    );
    expect(
      (
        await db.manager.findOneByOrFail(TrendFactorEntity, {
          tradeDate: latest,
        })
      ).data[0][0],
    ).toBe('000001.SZ');
  });
  test('北交所四价同比例的复权基准差异保留新代码并记录转换比例', async () => {
    await db.manager.insert(BseMappingEntity, {
      oldCode: '830001.BJ',
      newCode: '920001.BJ',
    });
    const data = response();
    data.data.items = [
      ['920001.BJ', '20260121', 5, 5.5, 6, 5],
      ['830001.BJ', '20260121', 10, 11, 12, 10],
      ...Array.from({ length: 20 }, (_, i) => [
        `${String(i + 1).padStart(6, '0')}.SZ`,
        '20260121',
        10,
        11,
        12,
        10,
      ]),
    ];
    source.queryData.mockResolvedValue(data);
    await service.syncDay(db.manager, latest, true);
    expect(
      (
        await db.manager.findOneByOrFail(TrendFactorEntity, {
          tradeDate: latest,
        })
      ).data.find((row) => row[0] === '920001.BJ'),
    ).toEqual(['920001.BJ', 5, 5.5, 6, 5, '920001.BJ', 0.5]);
  });
});
