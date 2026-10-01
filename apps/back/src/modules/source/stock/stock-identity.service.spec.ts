import { DataSource, EntityManager, Repository } from 'typeorm';
import { TushareService } from '@/shared/tushare/tushare.service';
import { SyncRunEntity } from '@/modules/daily-task/sync-run.entity';
import { DailyService } from '../daily/daily.service';
import { DailyEntity } from '../daily/daily.entity';
import { StockEntity } from './stock.entity';
import { StockHistoryEntity } from './stock-history.entity';
import {
  identityIndex,
  readIdentityRows,
  StockIdentityService,
} from './stock-identity.service';

const dates = ['2026-09-30', '2026-09-29', '2026-09-28'];
const snapshot = Object.assign(new StockHistoryEntity(), {
  snapshotKey: 'identity',
  asOf: '2026-10-02',
  data: {
    stocks: [
      {
        tsCode: '000001.SZ',
        name: 'ST新名称',
        listDate: '1991-01-01',
        delistDate: null,
      },
      {
        tsCode: '000002.SZ',
        name: '退市股票',
        listDate: '1991-01-01',
        delistDate: '2026-10-01',
      },
      {
        tsCode: '920001.BJ',
        name: '北交股票',
        listDate: '2024-01-01',
        delistDate: null,
      },
      {
        tsCode: '830001.BJ',
        name: '旧代码',
        listDate: '2024-01-01',
        delistDate: '2026-09-29',
      },
    ],
    names: [
      {
        tsCode: '000001.SZ',
        name: '正常旧名称',
        startDate: '1991-01-01',
        endDate: '2026-09-30',
      },
      {
        tsCode: '000001.SZ',
        name: 'ST新名称',
        startDate: '2026-10-01',
        endDate: null,
      },
      {
        tsCode: '000002.SZ',
        name: '正常股票',
        startDate: '1991-01-01',
        endDate: '2026-09-30',
      },
      {
        tsCode: '830001.BJ',
        name: '北交股票',
        startDate: '2024-01-01',
        endDate: null,
      },
    ],
  },
});
const mapping = [{ oldCode: '830001.BJ', newCode: '920001.BJ' }];

describe('股票历史身份与策略数据完整性', () => {
  it('按日期取名称，纳入当时仍上市的退市股，跨新旧北交代码取同一身份', () => {
    const identity = identityIndex(snapshot, mapping);
    expect(identity.name('000001.SZ', '2026-09-30')).toBe('正常旧名称');
    expect(identity.name('000001.SZ', '2026-10-01')).toBe('ST新名称');
    expect(identity.name('000002.SZ', '2026-09-30')).toBe('正常股票');
    expect(identity.name('000002.SZ', '2026-10-01')).toBe('');
    expect(identity.name('830001.BJ', '2026-09-30')).toBe('北交股票');
    expect(identity.name('920001.BJ', '2024-01-01')).toBe('N北交股票');
    expect(identity.name('920001.BJ', '2023-12-29')).toBe('');
    expect(identity.expand(['830001.BJ'])).toEqual(['920001.BJ', '830001.BJ']);
  });

  it('历史名称没有覆盖时不使用当前ST名称兜底', () => {
    const identity = identityIndex(
      {
        ...snapshot,
        data: { ...snapshot.data, names: [] },
      } as unknown as StockHistoryEntity,
      [],
    );
    expect(identity.name('000001.SZ', '2026-09-30')).toBe('');
    expect(identity.name('000001.SZ', '2026-10-02')).toBe('ST新名称');
  });

  it('上游错误、缺字段、行截断不能覆盖历史快照', () => {
    expect(() => readIdentityRows({ code: -1 }, ['ts_code'])).toThrow();
    expect(() =>
      readIdentityRows({ code: 0, data: { fields: [], items: [] } }, [
        'ts_code',
      ]),
    ).toThrow();
    expect(() =>
      readIdentityRows(
        { code: 0, data: { fields: ['ts_code'], items: [[]] } },
        ['ts_code'],
      ),
    ).toThrow();
  });

  function readiness() {
    const runs = dates.map((tradeDate) => ({
      task: 'daily',
      tradeDate,
      status: 'success',
      dailyCount: 2,
    }));
    const policies: any[] = [];
    const counts = dates.map((tradeDate) => ({ tradeDate, count: '2' }));
    const manager = {
      find: jest.fn((entity) =>
        Promise.resolve(entity === SyncRunEntity ? runs : policies),
      ),
    };
    const db = {
      manager,
      query: jest.fn().mockResolvedValue(counts),
    } as unknown as DataSource;
    return {
      runs,
      policies,
      counts,
      service: new StockIdentityService(db, {} as TushareService),
    };
  }

  it('完整成功窗口正常放行，不能把缺日或行数缩水当作零匹配', async () => {
    const { service, counts } = readiness();
    await expect(service.assertReady(dates)).resolves.toBeUndefined();
    counts[1].count = '1';
    await expect(service.assertReady(dates)).rejects.toThrow(
      '行情数据未同步完整',
    );
  });

  it.each(['running', 'failed', 'pending'])(
    '%s窗口拒绝发布筛选结果',
    async (status) => {
      const { service, runs } = readiness();
      runs[0].status = status;
      await expect(service.assertReady(dates)).rejects.toThrow(
        '行情数据未同步完整',
      );
    },
  );

  it('主动删除保护及不足交易日均拒绝筛选', async () => {
    const { service, policies } = readiness();
    policies.push({ tradeDate: dates[0] });
    await expect(service.assertReady(dates)).rejects.toThrow(
      '行情数据未同步完整',
    );
    await expect(service.assertReady(dates.slice(0, 2))).rejects.toThrow(
      '交易日不足',
    );
  });

  it('初次刷新包含退市列表，跳过非股票标识', async () => {
    const response = (fields: string[], items: any[]) => ({
      code: 0,
      data: { fields, items },
    });
    const manager = {
      findOneBy: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    };
    const api = {
      getStockBasic: jest
        .fn()
        .mockImplementation((status) =>
          Promise.resolve(
            response(
              ['ts_code', 'name', 'list_date', 'delist_date'],
              status === 'D'
                ? [['000002.SZ', '退市股票', '19910101', '20261001']]
                : [],
            ),
          ),
        ),
      queryData: jest.fn().mockImplementation((name) =>
        Promise.resolve(
          name === 'namechange'
            ? response(
                ['ts_code', 'name', 'start_date', 'end_date'],
                [
                  ['000002.SZ', '普通名称', '19910101', '20260930'],
                  ['X19363.SH', '非上市', '20190101', null],
                ],
              )
            : response(
                ['ts_code', 'name', 'trade_date'],
                [['000001.SZ', '正常股票', '20260930']],
              ),
        ),
      ),
    };
    await new StockIdentityService(
      {} as DataSource,
      api as unknown as TushareService,
    ).refresh(
      manager as unknown as EntityManager,
      [
        { tsCode: '000001.SZ', name: '正常股票', listDate: '1991-01-01' },
      ] as StockEntity[],
    );
    expect(api.getStockBasic.mock.calls).toEqual([['D'], ['P']]);
    expect(manager.upsert.mock.calls[0][1].data.stocks).toHaveLength(2);
    expect(manager.upsert.mock.calls[0][1].data.names).toHaveLength(1);
  });

  it('曾用名缺失或结束后有空白时，按历史日期补名并复用缓存', async () => {
    const registry = Object.assign(new StockHistoryEntity(), snapshot, {
      data: { stocks: [snapshot.data.stocks[0]], names: [] },
    });
    const saved = new Map<string, StockHistoryEntity>([['identity', registry]]);
    const manager = {
      findOneBy: jest.fn((_, q) => Promise.resolve(saved.get(q.snapshotKey))),
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn((_, value) => {
        saved.set(value.snapshotKey, value);
      }),
    };
    const api = {
      queryData: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: ['ts_code', 'name', 'trade_date'],
          items: [['000001.SZ', '历史正常股票', '20260930']],
        },
      }),
    };
    const service = new StockIdentityService(
      { manager } as unknown as DataSource,
      api as unknown as TushareService,
    );
    expect(
      (await service.load(['2026-09-30'])).name('000001.SZ', '2026-09-30'),
    ).toBe('历史正常股票');
    expect(
      (await service.load(['2026-09-30'])).name('000001.SZ', '2026-09-30'),
    ).toBe('历史正常股票');
    expect(api.queryData).toHaveBeenCalledTimes(1);
    expect(saved.get('day:2026-09-30')!.data.stocks).toEqual([]);
    await expect(service.load(['2026-09-29'])).rejects.toThrow(
      '历史股票名称补数异常',
    );
  });

  it('新旧代码跨日窗口合并后入选；相同日期行情冲突明确报错', async () => {
    const rows = dates
      .slice()
      .reverse()
      .map((tradeDate, index) =>
        Object.assign(new DailyEntity(), {
          tsCode: index === 0 ? '830001.BJ' : '920001.BJ',
          tradeDate,
          name: '',
          open: String(10 + index),
          close: String(11 + index),
          high: String(11 + index),
          low: String(10 + index),
          preClose: String(10 + index),
          vol: '100',
          amount: '60000',
          upLimit: '20',
        }),
      );
    const identity = {
      assertReady: jest.fn(),
      load: jest.fn().mockResolvedValue(identityIndex(snapshot, mapping)),
    };
    const service = new DailyService(
      undefined!,
      {
        find: jest.fn().mockResolvedValue(rows),
      } as unknown as Repository<DailyEntity>,
      identity as unknown as StockIdentityService,
    );
    const hits = await service.findThreeDaysHighVol(dates);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ tsCode: '920001.BJ', name: '北交股票' });
    rows.push({ ...rows[2], tsCode: '830001.BJ', close: '19' } as DailyEntity);
    await expect(service.findThreeDaysHighVol(dates)).rejects.toThrow(
      '新旧代码行情冲突',
    );
  });
});
