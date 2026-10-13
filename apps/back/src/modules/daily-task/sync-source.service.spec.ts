import { TushareService } from '@/shared/tushare/tushare.service';
import * as dayjs from 'dayjs';
import { StockEntity } from '../source/stock/stock.entity';
import {
  readSnapshot,
  SyncSourceService,
  marketCoverage,
} from './sync-source.service';

describe('同步数据校验', () => {
  it('拒绝整座交易所缺失的行情，但不要求尚未上市的历史市场', () => {
    const stocks = Array.from({ length: 20 }, (_, n) => ({
      tsCode: `${830000 + n}.BJ`,
      listDate: '2024-01-01',
    }));
    expect(marketCoverage(['000001.SZ'], stocks, '2026-09-24')).toBe(false);
    expect(
      marketCoverage(['000001.SZ', '830000.BJ'], stocks, '2026-09-24'),
    ).toBe(true);
    expect(marketCoverage(['000001.SZ'], stocks, '2023-12-29')).toBe(true);
  });
  it('错误码、字段缺失、行截断和空必需快照均报错', () => {
    expect(() =>
      readSnapshot({ code: -1, message: '权限不足' }, ['ts_code']),
    ).toThrow();
    expect(() =>
      readSnapshot({ code: 0, message: '', data: { fields: [], items: [] } }, [
        'ts_code',
      ]),
    ).toThrow();
    expect(() =>
      readSnapshot(
        { code: 0, message: '', data: { fields: ['ts_code'], items: [] } },
        ['ts_code'],
      ),
    ).toThrow();
    expect(() =>
      readSnapshot(
        { code: 0, message: '', data: { fields: ['ts_code'], items: [[]] } },
        ['ts_code'],
      ),
    ).toThrow();
    expect(
      readSnapshot(
        { code: 0, message: '', data: { fields: ['ts_code'], items: [] } },
        ['ts_code'],
        true,
      ),
    ).toEqual([]);
  });

  it('按字段名映射交易日历而非依赖上游字段顺序', async () => {
    const items = Array.from({ length: 366 }, (_, index) => [
      1,
      '20191231',
      dayjs('2020-01-01').add(index, 'day').format('YYYYMMDD'),
    ]);
    const api = {
      getTradeCal: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: ['is_open', 'pretrade_date', 'cal_date'],
          items,
        },
      }),
    };
    const service = new SyncSourceService(api as unknown as TushareService);
    await expect(service.calendar(2020)).resolves.toEqual(
      expect.arrayContaining([
        { calDate: '2020-01-01', isOpen: 1, preTradeDate: '2019-12-31' },
      ]),
    );
    items.pop();
    await expect(service.calendar(2020)).rejects.toThrow('交易日历不完整');
  });

  it('日线保持原有合并口径、停牌零值与股票名称补全', async () => {
    const api = {
      getDaily: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: [
            'ts_code',
            'trade_date',
            'open',
            'high',
            'low',
            'close',
            'pre_close',
            'change',
            'pct_chg',
            'vol',
            'amount',
          ],
          items: [
            ['000001.SZ', '20240701', 10, 11, 9, 11, 10, 1, 10, 100, 1000],
          ],
        },
      }),
      getDailyLimit: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: ['ts_code', 'trade_date', 'up_limit', 'down_limit'],
          items: [
            ['000001.SZ', '20240701', 11, 9],
            ['000002.SZ', '20240701', 11, 9],
          ],
        },
      }),
      getDailyBasic: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: ['ts_code', 'trade_date', 'pe'],
          items: [['000001.SZ', '20240701', null]],
        },
      }),
      queryData: jest.fn().mockResolvedValue({
        code: 0,
        data: {
          fields: ['ts_code', 'trade_date', 'suspend_type', 'suspend_timing'],
          items: [['000002.SZ', '20240701', 'S', null]],
        },
      }),
    };
    const service = new SyncSourceService(api as unknown as TushareService);
    const rows = await service.daily('2024-07-01', [
      { tsCode: '000001.SZ', name: '股票名称' },
    ] as StockEntity[]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: '股票名称',
      tradeDate: '2024-07-01',
      close: 11,
      pe: null,
      peTtm: null,
      turnoverRateF: null,
      volumeRatio: null,
    });
    expect(rows[1]).toMatchObject({ tsCode: '000002.SZ', open: 0, close: 0 });
    expect(api.queryData).toHaveBeenCalledTimes(1);
  });

  it.each([
    { name: '空停牌来源', events: [] },
    {
      name: '日内停牌',
      events: [['000002.SZ', '20240701', 'S', '09:30-10:00']],
    },
    { name: '当日复牌', events: [['000002.SZ', '20240701', 'R', null]] },
    {
      name: '停牌同时有复牌记录',
      events: [
        ['000002.SZ', '20240701', 'S', null],
        ['000002.SZ', '20240701', 'R', null],
      ],
    },
  ])('拒绝以 $name 推断缺失行情为全天停牌', async ({ events }) => {
    const response = (fields: string[], items: unknown[][]) => ({
      code: 0,
      data: { fields, items },
    });
    const api = {
      getDaily: jest
        .fn()
        .mockResolvedValue(
          response(
            [
              'ts_code',
              'trade_date',
              'open',
              'high',
              'low',
              'close',
              'pre_close',
              'change',
              'pct_chg',
              'vol',
              'amount',
            ],
            [['000001.SZ', '20240701', 10, 11, 9, 11, 10, 1, 10, 100, 1000]],
          ),
        ),
      getDailyLimit: jest.fn().mockResolvedValue(
        response(
          ['ts_code', 'trade_date', 'up_limit', 'down_limit'],
          [
            ['000001.SZ', '20240701', 11, 9],
            ['000002.SZ', '20240701', 11, 9],
          ],
        ),
      ),
      getDailyBasic: jest.fn().mockResolvedValue(
        response(
          ['ts_code', 'trade_date'],
          [
            ['000001.SZ', '20240701'],
            ['000002.SZ', '20240701'],
          ],
        ),
      ),
      queryData: jest
        .fn()
        .mockResolvedValue(
          response(
            ['ts_code', 'trade_date', 'suspend_type', 'suspend_timing'],
            events,
          ),
        ),
    };
    await expect(
      new SyncSourceService(api as any).daily('2024-07-01', []),
    ).rejects.toThrow('未确认全天停牌');
  });

  it('所有股票都有行情时不增加停牌来源请求', async () => {
    const response = (fields: string[], items: unknown[][]) => ({
      code: 0,
      data: { fields, items },
    });
    const api = {
      getDaily: jest
        .fn()
        .mockResolvedValue(
          response(
            [
              'ts_code',
              'trade_date',
              'open',
              'high',
              'low',
              'close',
              'pre_close',
              'change',
              'pct_chg',
              'vol',
              'amount',
            ],
            [['000001.SZ', '20240701', 10, 11, 9, 11, 10, 1, 10, 100, 1000]],
          ),
        ),
      getDailyLimit: jest
        .fn()
        .mockResolvedValue(
          response(
            ['ts_code', 'trade_date', 'up_limit', 'down_limit'],
            [['000001.SZ', '20240701', 11, 9]],
          ),
        ),
      getDailyBasic: jest
        .fn()
        .mockResolvedValue(
          response(['ts_code', 'trade_date'], [['000001.SZ', '20240701']]),
        ),
      queryData: jest.fn(),
    };
    await expect(
      new SyncSourceService(api as any).daily('2024-07-01', []),
    ).resolves.toHaveLength(1);
    expect(api.queryData).not.toHaveBeenCalled();
  });

  it.each(['200012.SZ', '201872.SZ', '900901.SH', '900901.BJ'])(
    '涨跌停接口独有的 B 股 %s 不阻断 A 股，且不会伪造零行情',
    async (code) => {
      const response = (fields: string[], items: unknown[][]) => ({
        code: 0,
        data: { fields, items },
      });
      const api = {
        getDaily: jest
          .fn()
          .mockResolvedValue(
            response(
              [
                'ts_code',
                'trade_date',
                'open',
                'high',
                'low',
                'close',
                'pre_close',
                'change',
                'pct_chg',
                'vol',
                'amount',
              ],
              [['920001.BJ', '20261013', 10, 11, 9, 11, 10, 1, 10, 100, 1000]],
            ),
          ),
        getDailyLimit: jest.fn().mockResolvedValue(
          response(
            ['ts_code', 'trade_date', 'up_limit', 'down_limit'],
            [
              ['920001.BJ', '20261013', 13, 7],
              [code, '20261013', 11, 9],
            ],
          ),
        ),
        getDailyBasic: jest
          .fn()
          .mockResolvedValue(
            response(['ts_code', 'trade_date'], [['920001.BJ', '20261013']]),
          ),
        queryData: jest
          .fn()
          .mockResolvedValue(
            response(
              ['ts_code', 'trade_date', 'suspend_type', 'suspend_timing'],
              [],
            ),
          ),
      };
      const service = new SyncSourceService(api as any);
      await expect(service.daily('2026-10-13', [])).resolves.toEqual([
        expect.objectContaining({ tsCode: '920001.BJ', close: 11 }),
      ]);
      expect(api.queryData).not.toHaveBeenCalled();
      // Catalog evidence must not be silently discarded by a code prefix.
      await expect(
        service.daily('2026-10-13', [
          { tsCode: code, name: '已收录股票' } as StockEntity,
        ]),
      ).rejects.toThrow('未确认全天停牌');
      // A daily-basic row also keeps the code in the completeness check.
      api.getDailyBasic.mockResolvedValue(
        response(
          ['ts_code', 'trade_date'],
          [
            ['920001.BJ', '20261013'],
            [code, '20261013'],
          ],
        ),
      );
      await expect(service.daily('2026-10-13', [])).rejects.toThrow(
        '未确认全天停牌',
      );
    },
  );

  it('拒绝错误日期与重复业务键的涨跌停快照，允许合法零条', async () => {
    const api = { getLimitList: jest.fn() };
    const service = new SyncSourceService(api as unknown as TushareService);
    const data = {
      fields: ['ts_code', 'trade_date', 'name', 'limit'],
      items: [['000001.SZ', '20240702', '股票', 'U']],
    };
    api.getLimitList.mockResolvedValue({ code: 0, data });
    await expect(service.limits('2024-07-01')).rejects.toThrow(
      '交易日期不匹配',
    );
    data.items = [data.items[0], data.items[0]];
    await expect(service.limits('2024-07-02')).rejects.toThrow('重复业务键');
    data.items = [];
    await expect(service.limits('2024-07-02')).resolves.toEqual([]);
  });
});
