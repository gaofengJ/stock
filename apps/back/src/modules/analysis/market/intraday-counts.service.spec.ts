import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { IntradayCountsService } from './intraday-counts.service';
import { collectionSlot, parseClsCounts } from './intraday-counts.utils';
import { IntradayCountsQueryDto } from './intraday-counts.dto';

const now = new Date('2026-09-30T01:35:00Z');
const reply = (up: unknown = 2567, down: unknown = 2824) => ({
  code: 200,
  data: {
    up_down_dis: {
      status: true,
      rise_num: up,
      fall_num: down,
      flat_num: 181,
      suspend_num: 11,
    },
  },
});

describe('财联社盘中涨跌家数', () => {
  afterEach(() => jest.restoreAllMocks());

  it('采样时段按北京时间划分，排除午休、周末、盘前盘后和非5分钟时点', () => {
    expect(collectionSlot(now)).toEqual({ date: '2026-09-30', time: '09:35' });
    expect(collectionSlot(new Date('2026-09-30T07:00:00Z'))?.time).toBe(
      '15:00',
    );
    [
      '2026-09-30T01:25:00Z',
      '2026-09-30T01:36:00Z',
      '2026-09-30T04:00:00Z',
      '2026-09-30T07:05:00Z',
      '2026-10-03T01:35:00Z',
    ].forEach((time) => expect(collectionSlot(new Date(time))).toBeNull());
  });

  it('读取的是上涨/下跌家数，而非涨停/跌停或包含停牌的平盘数', () => {
    expect(parseClsCounts(reply())).toEqual({ up: 2567, down: 2824 });
    expect(parseClsCounts(reply('0', 5000))).toEqual({ up: 0, down: 5000 });
  });

  it.each([undefined, null, '', -1, 1.5, 'NaN', ' ', false])(
    '拒绝异常上涨家数 %p',
    (value) => {
      const body = reply();
      body.data.up_down_dis.rise_num = value;
      expect(() => parseClsCounts(body)).toThrow();
    },
  );

  it('拒绝上游失败、停止更新和空市场，不能写为0', () => {
    expect(() => parseClsCounts({ code: 429 })).toThrow();
    expect(() =>
      parseClsCounts({ code: 200, data: { up_down_dis: { status: false } } }),
    ).toThrow();
    expect(() => parseClsCounts(reply(0, 0))).toThrow();
  });

  function fixture(open = 1, present = false, locked = 1) {
    const runner = {
      connect: jest.fn(),
      release: jest.fn(),
      isTransactionActive: false,
      startTransaction: jest.fn().mockImplementation(() => {
        runner.isTransactionActive = true;
      }),
      commitTransaction: jest.fn().mockImplementation(() => {
        runner.isTransactionActive = false;
      }),
      rollbackTransaction: jest.fn().mockImplementation(() => {
        runner.isTransactionActive = false;
      }),
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('GET_LOCK')) return [{ acquired: locked }];
        if (sql.includes('is_open')) return [{ is_open: open }];
        if (sql.startsWith('SELECT 1')) return present ? [{}] : [];
        if (sql.startsWith('SELECT DISTINCT'))
          return Array.from({ length: 30 }, (_, i) => ({
            date: i === 29 ? '2026-08-20' : '2026-09-30',
          }));
        return [];
      }),
    };
    const db = {
      createQueryRunner: jest.fn().mockReturnValue(runner),
      query: jest.fn(),
    };
    const config = { get: jest.fn().mockReturnValue('true') };
    const service = new IntradayCountsService(
      db as unknown as DataSource,
      config as unknown as ConfigService,
    );
    const fetch = jest.spyOn(axios, 'get').mockResolvedValue({ data: reply() });
    jest.spyOn(Date, 'now').mockReturnValue(now.getTime());
    return { db, runner, service, fetch };
  }

  it.each([
    [0, false, 1],
    [1, true, 1],
    [1, false, 0],
  ])(
    '节假日、已有时点或其他实例持锁均不请求上游 (%#)',
    async (open, present, locked) => {
      const test = fixture(Number(open), Boolean(present), Number(locked));
      expect(await test.service.collect(now)).toBe(false);
      expect(test.fetch).not.toHaveBeenCalled();
      expect(test.runner.startTransaction).not.toHaveBeenCalled();
      expect(test.runner.release).toHaveBeenCalled();
    },
  );

  it('单次只存家数与时间，写入和30个交易日清理一起提交，释放跨实例锁', async () => {
    const test = fixture();
    expect(await test.service.collect(now)).toBe(true);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    expect(test.runner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE'),
      ['2026-09-30', '09:35', 2567, 2824],
    );
    expect(test.runner.query).toHaveBeenCalledWith(
      'DELETE FROM t_market_intraday_counts WHERE trade_date<?',
      ['2026-08-20'],
    );
    expect(test.runner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(test.runner.query).toHaveBeenCalledWith(
      "SELECT RELEASE_LOCK('stock_cls_counts_v1')",
    );
  });

  it('上游限流不修改历史记录，也不立即重试', async () => {
    const test = fixture();
    test.fetch.mockRejectedValue(new Error('429'));
    await expect(test.service.collect(now)).rejects.toThrow('429');
    expect(test.runner.startTransaction).not.toHaveBeenCalled();
    expect(
      test.runner.query.mock.calls.some(([sql]) => /INSERT|DELETE/.test(sql)),
    ).toBe(false);
    expect(test.fetch).toHaveBeenCalledTimes(1);
    expect(test.runner.release).toHaveBeenCalled();
  });

  it('清理失败回滚新增记录，后续采样仍可以继续', async () => {
    const test = fixture();
    const original = test.runner.query.getMockImplementation()!;
    test.runner.query.mockImplementation((sql: string) => {
      if (sql.startsWith('DELETE')) throw new Error('cleanup failed');
      return original(sql);
    });
    await expect(test.service.collect(now)).rejects.toThrow('cleanup failed');
    expect(test.runner.rollbackTransaction).toHaveBeenCalledTimes(1);
    test.runner.query.mockImplementation(original);
    expect(await test.service.collect(now)).toBe(true);
  });

  it('读接口只查询存储，不因刷新页面请求财联社；空历史正常返回', async () => {
    const test = fixture();
    test.db.query.mockResolvedValue([]);
    expect(
      await test.service.series(new IntradayCountsQueryDto()),
    ).toMatchObject({
      retentionDays: 30,
      scope: 'all',
      dates: [],
      points: [],
    });
    expect(test.fetch).not.toHaveBeenCalled();
  });

  it('历史重建和实时采样分别返回来源，混合查询不误标为财联社', async () => {
    const test = fixture();
    test.db.query
      .mockResolvedValueOnce([{ date: '2026-09-30' }])
      .mockResolvedValueOnce([
        {
          date: '2026-09-30',
          time: '09:35',
          up_count: 2000,
          down_count: 3000,
          collected_at: now,
          source: 'history_5m',
        },
        {
          date: '2026-09-30',
          time: '09:40',
          up_count: 2100,
          down_count: 2900,
          collected_at: now,
          source: 'cls',
        },
      ]);
    const result = await test.service.series(new IntradayCountsQueryDto());
    expect(result.source).toBe('财联社实时 / 历史行情重建');
    expect(
      result.points.map((point: { source: string }) => point.source),
    ).toEqual(['history_5m', 'cls']);
    expect(test.fetch).not.toHaveBeenCalled();
  });
});
