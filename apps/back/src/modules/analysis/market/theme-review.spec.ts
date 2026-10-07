/* eslint-disable no-nested-ternary -- Source fixtures select independent source payloads. */
import { ACCESS } from '@/modules/auth/permissions';
import { ThemeReviewController } from './theme-review.controller';
import { buildThemeReview, reviewAnnouncements } from './theme-review.rules';
import { ThemeReviewService } from './theme-review.service';

const date = '2026-09-30';
const stocks = [
  {
    tsCode: '600001.SH',
    name: '甲',
    limitTimes: 1,
    lastTime: '10:00:00',
    amount: '0',
  },
  {
    tsCode: '600002.SH',
    name: '乙',
    limitTimes: 3,
    lastTime: '09:30:00',
    amount: null,
  },
  {
    tsCode: '600003.SH',
    name: '丙',
    limitTimes: 1,
    lastTime: null,
    amount: '100000000',
  },
] as any;
const rows = [
  {
    ts_code: '600001.SH',
    trade_date: '20260930',
    theme: '创新药、医药、创新药',
    lu_desc: '创新药+创新药+业绩增长',
    status: '首板',
  },
  {
    ts_code: '600002.SH',
    trade_date: '20260930',
    theme: '创新药、医药',
    lu_desc: '',
    status: '3连板',
  },
  {
    ts_code: '000001.SZ',
    trade_date: '20260930',
    theme: '其他',
    lu_desc: '不在涨停名单',
  },
];
const snapshot = (source: string, data: any[] = [], state = 'ready') => ({
  source,
  rows: data,
  state,
  fetchedAt: '2026-10-01T00:00:00Z',
  message: null,
});

describe('theme review provenance and membership', () => {
  it('counts each eligible stock once, preserves secondary themes, zeros and missing reasons', () => {
    const result = buildThemeReview(stocks, rows, date);
    expect(result).toMatchObject({ total: 3, classified: 2, explained: 1 });
    expect(result.groups.map((g) => g.name)).toEqual(['创新药', '题材待补充']);
    expect(result.groups[0]).toMatchObject({
      count: 2,
      maxHeight: 3,
      amount: 0,
    });
    expect(result.groups[0].items.map((r) => r.tsCode)).toEqual([
      '600002.SH',
      '600001.SH',
    ]);
    expect(result.groups[0].items[0].reason).toBeNull();
    expect(result.groups[0].items[1].themes).toEqual(['创新药', '医药']);
    expect(result.groups[0].items[1].keywords).toEqual(['创新药', '业绩增长']);
    expect(result.groups.flatMap((g) => g.items)).toHaveLength(3);
  });

  it('rejects a different date, ambiguous duplicate stock rows and invalid codes', () => {
    expect(() =>
      buildThemeReview(stocks, [{ ...rows[0], trade_date: '20261001' }], date),
    ).toThrow();
    expect(() => buildThemeReview(stocks, [rows[0], rows[0]], date)).toThrow();
    expect(() =>
      buildThemeReview(stocks, [{ ...rows[0], ts_code: 'bad' }], date),
    ).toThrow();
  });

  it('excludes future, late-published, old and other-stock announcements; never returns unsafe links', () => {
    const notice = {
      ts_code: '600001.SH',
      ann_date: '20260929',
      title: '项目进展',
      url: 'https://data.eastmoney.com/notice',
    };
    const result = reviewAnnouncements(
      [
        notice,
        notice,
        { ...notice, ann_date: '20261001' },
        { ...notice, rec_time: '2026-10-01 09:00:00' },
        { ...notice, ts_code: '600002.SH' },
        { ...notice, ann_date: '20260801' },
        // eslint-disable-next-line no-script-url -- Verify unsafe source URLs are rejected.
        { ...notice, title: '董事会公告', url: 'javascript:alert(1)' },
      ],
      '600001.SH',
      '2026-09-01',
      date,
    );
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.title === '董事会公告')?.url).toBeNull();
    expect(result.every((r) => r.date <= date)).toBe(true);
  });

  it('does not request sources before base data is published, or for an empty filter', async () => {
    const market = {
      limits: jest.fn().mockResolvedValue({ ready: false, items: [] }),
    };
    const cache = { read: jest.fn() };
    const service = new ThemeReviewService(market as any, cache as any);
    expect((await service.board({ date } as any)).ready).toBe(false);
    market.limits.mockResolvedValue({ ready: true, items: [] });
    expect((await service.board({ date } as any)).ready).toBe(true);
    expect(cache.read).not.toHaveBeenCalled();
  });

  it('retains the date and filters and exposes source errors without inventing classifications', async () => {
    const market = {
      limits: jest.fn().mockResolvedValue({ ready: true, items: stocks }),
    };
    const cache = {
      read: jest.fn().mockResolvedValue({
        ...snapshot('kpl_list', [], 'error'),
        message: '数据源权限或日额度不足',
      }),
    };
    const service = new ThemeReviewService(market as any, cache as any);
    const result = await service.board({
      date,
      scope: 'main',
      height: 4,
      keyword: '甲',
      sector: '885001.TI',
    } as any);
    expect(market.limits).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'main',
        height: 4,
        keyword: '甲',
        sector: '885001.TI',
        type: 'U',
      }),
    );
    expect(result.sources[0]).toMatchObject({ state: 'error' });
    expect(result.groups[0].name).toBe('题材待补充');
    expect(result.explained).toBe(0);
  });

  it('only loads detail for a stock in the selected universe and selects disclosed financials', async () => {
    const market = {
      limits: jest.fn().mockResolvedValue({ ready: true, items: stocks }),
    };
    const cache = {
      read: jest.fn(async (source) =>
        snapshot(
          source,
          source === 'kpl_list'
            ? rows
            : source === 'fina_indicator'
            ? [
                {
                  ts_code: '600001.SH',
                  end_date: '20260930',
                  ann_date: '20261020',
                  or_yoy: 99,
                },
                {
                  ts_code: '600001.SH',
                  end_date: '20260630',
                  ann_date: '20260820',
                  or_yoy: 0,
                  netprofit_yoy: -5,
                  profit_dedt: 100000000,
                },
                {
                  ts_code: '600002.SH',
                  end_date: '20260630',
                  ann_date: '20260820',
                  or_yoy: 88,
                },
              ]
            : [],
        ),
      ),
    };
    const service = new ThemeReviewService(market as any, cache as any);
    const result = await service.detail(
      { date, scope: 'hs' } as any,
      '600001.SH',
    );
    expect(result.financial).toMatchObject({
      period: '2026-06-30',
      announcedAt: '2026-08-20',
      revenueGrowth: 0,
      profitGrowth: -5,
      deductedProfit: 100000000,
      roe: null,
    });
    cache.read.mockClear();
    await expect(
      service.detail({ date, scope: 'hs' } as any, '000001.SZ'),
    ).rejects.toThrow('涨停名单');
    expect(
      cache.read.mock.calls.some(([source]) => source === 'eastmoney_ann'),
    ).toBe(false);
  });

  it('protects both endpoints with the existing limit-review permission', () => {
    expect(
      Reflect.getMetadata(ACCESS, ThemeReviewController.prototype.board),
    ).toEqual({ any: ['analysis:limits'] });
    expect(
      Reflect.getMetadata(ACCESS, ThemeReviewController.prototype.detail),
    ).toEqual({ any: ['analysis:limits'] });
  });
});
