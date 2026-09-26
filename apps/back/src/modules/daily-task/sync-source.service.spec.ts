import { TushareService } from '@/shared/tushare/tushare.service';
import * as dayjs from 'dayjs';
import { StockEntity } from '../source/stock/stock.entity';
import { readSnapshot, SyncSourceService } from './sync-source.service';

describe('同步数据校验', () => {
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
      pe: 0,
    });
    expect(rows[1]).toMatchObject({ tsCode: '000002.SZ', open: 0, close: 0 });
  });

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
