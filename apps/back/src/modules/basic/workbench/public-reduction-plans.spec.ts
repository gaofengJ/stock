import {
  planHolders,
  planPeriods,
  publicReductionPlans,
} from './public-reduction-plans';

const date = '2026-10-06';
const original =
  '股东名称 持股数量\n股东甲    1,000    1%\n股东乙    2,000    2%\n5、减持期间：2026 年 9 月 21 日至 2026 年 12 月 20 日';
const notice = (
  id: string,
  title: string,
  code = '301272',
  announced = '2026-08-28',
) => ({
  art_code: id,
  title,
  notice_date: announced,
  codes: [{ stock_code: code }],
});
function fixture(notices: any[], texts: Record<string, string | null>) {
  return jest.fn(async (url: string, options: any) => {
    if (url.includes('/security/ann'))
      return {
        data: {
          success: true,
          data: { list: notices, page_index: 1, total_hits: notices.length },
        },
      };
    const id = options.params.art_code;
    if (texts[id] == null) throw new Error('unavailable');
    return {
      data: {
        success: true,
        data: {
          art_code: id,
          notice_date: notices.find((r) => r.art_code === id).notice_date,
          page_size: 1,
          notice_content: texts[id],
        },
      },
    };
  });
}
const rows = (result: any) =>
  result.data.items.map((values: any[]) =>
    Object.fromEntries(
      result.data.fields.map((field: string, index: number) => [
        field,
        values[index],
      ]),
    ),
  );

describe('original current reduction plans', () => {
  it('reuses verified announcement bodies on the next refresh while rechecking the catalog', async () => {
    const get = fixture([notice('AN992000', '股东减持计划预披露')], {
      AN992000: original,
    });
    const first = await publicReductionPlans(get as any, date);
    const second = await publicReductionPlans(get as any, date);
    expect(second).toEqual(first);
    expect(
      get.mock.calls.filter(([url]) => url.includes('/content/ann')),
    ).toHaveLength(1);
    expect(
      get.mock.calls.filter(([url]) => url.includes('/security/ann')),
    ).toHaveLength(2);
  });
  it('reads explicit plan periods and holders, never actual trade intervals or relative dates', () => {
    expect(planPeriods(original)).toEqual([
      { start: '2026-09-21', end: '2026-12-20' },
    ]);
    expect(planHolders(original)).toEqual(['股东甲', '股东乙']);
    expect(planPeriods('实际减持期间：2026年9月29日至2026年9月30日')).toEqual(
      [],
    );
    expect(
      planPeriods('减持期间：公告披露之日起十五个交易日后的三个月内'),
    ).toEqual([]);
  });

  it('excludes completed holders and expired plans, retains future plans privately, and ignores actual progress intervals', async () => {
    const announcements = [
      notice('AN990001', '股东减持计划预披露公告'),
      notice('AN990002', '股东甲减持计划实施完毕', '301272', '2026-09-30'),
      notice('AN990003', '股东减持计划预披露', '000001'),
      notice('AN990004', '股东减持计划预披露', '000002'),
      notice('AN990005', '股东减持计划进展公告', '301272', '2026-09-30'),
      notice('AN990006', '股东减持计划预披露', '000003'),
    ];
    const get = fixture(announcements, {
      AN990001: original,
      AN990002: '股东甲于2026年8月28日披露的减持计划已实施完毕。',
      AN990003: '减持期间：2026年9月1日至2026年9月30日',
      AN990004: '减持期间：2026年10月7日至2026年12月20日',
      AN990005: '减持期间：2026年9月29日至2026年9月30日',
      AN990006: '减持期间：十五个交易日之后三个月内',
    });
    const result = rows(await publicReductionPlans(get as any, date));
    expect(result.find((r: any) => r.ts_code === '301272.SZ')).toMatchObject({
      plan_start: '2026-09-21',
      plan_end: '2026-12-20',
      plan_status: 'active',
      holder_names: ['股东乙'],
    });
    expect(result.some((r: any) => r.ts_code === '000001.SZ')).toBe(false);
    expect(result.find((r: any) => r.ts_code === '000002.SZ').plan_status).toBe(
      'upcoming',
    );
    expect(result.find((r: any) => r.ts_code === '000003.SZ').plan_status).toBe(
      'unknown',
    );
    expect(
      get.mock.calls.some(
        ([, config]) => config.params.art_code === 'AN990005',
      ),
    ).toBe(false);
  });

  it('does not claim ongoing when a later termination cannot be checked, or when dates are invalid', async () => {
    const announcements = [
      notice('AN990011', '股东减持计划预披露'),
      notice('AN990012', '提前终止减持计划', '301272', '2026-09-30'),
      notice('AN990013', '股东减持计划预披露', '000003'),
    ];
    const get = fixture(announcements, {
      AN990011: original,
      AN990012: null,
      AN990013: '减持期间：2026年2月30日至2026年12月20日',
    });
    expect(
      rows(await publicReductionPlans(get as any, date)).map(
        (r: any) => r.plan_status,
      ),
    ).toEqual(['unknown', 'unknown']);
  });

  it('rejects truncated catalogs and future announcements instead of caching an empty success', async () => {
    const get = fixture(
      [notice('AN990021', '股东减持计划预披露', '301272', '2026-10-07')],
      {},
    );
    await expect(publicReductionPlans(get as any, date)).rejects.toThrow(
      '日期超出范围',
    );
    const truncated = jest.fn(async () => ({
      data: { success: true, data: { list: [], page_index: 1, total_hits: 1 } },
    }));
    await expect(publicReductionPlans(truncated as any, date)).rejects.toThrow(
      '分页缺失',
    );
  });

  it('stops repeated failed body reads and rejects an outage instead of replacing a usable snapshot', async () => {
    const announcements = Array.from({ length: 25 }, (_, i) =>
      notice(`AN9910${i}`, '股东减持计划预披露'),
    );
    const get = fixture(announcements, {});
    await expect(publicReductionPlans(get as any, date)).rejects.toThrow(
      '保留已有快照',
    );
    expect(
      get.mock.calls.filter(([url]) => url.includes('/content/ann')).length,
    ).toBeLessThanOrEqual(8);
  });

  it('preserves the HTTP failure after the outage circuit stops further reads', async () => {
    jest.useFakeTimers();
    try {
      const announcements = Array.from({ length: 25 }, (_, i) =>
        notice(`AN9930${i}`, '股东减持计划预披露'),
      );
      const catalog = fixture(announcements, {});
      const get = jest.fn(async (url: string, options: any) => {
        if (url.includes('/security/ann')) return catalog(url, options);
        throw Object.assign(new Error('upstream unavailable'), {
          response: { status: 502 },
        });
      });
      const pending = expect(
        publicReductionPlans(get as any, date),
      ).rejects.toThrow('HTTP 502，尝试 3 次');
      await jest.runAllTimersAsync();
      await pending;
      expect(
        get.mock.calls.filter(([url]) => url.includes('/content/ann')).length,
      ).toBeLessThanOrEqual(24);
    } finally {
      jest.useRealTimers();
    }
  });
});
