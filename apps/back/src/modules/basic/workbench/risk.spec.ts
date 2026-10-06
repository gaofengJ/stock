import 'reflect-metadata';
import { WorkbenchService } from './workbench.service';
import { publicAnnouncements } from './public-announcements';

const row = (id: string, date = '2026-09-30') => ({
  art_code: `AN${id}`,
  codes: [{ stock_code: '000001' }],
  title: '样本公告',
  notice_date: date,
});
describe('risk evidence sources', () => {
  it('reads complete announcement pagination and rejects truncated, wrong-code or duplicate pages', async () => {
    const get = jest.fn(async (_url, options) => ({
      data: {
        success: 1,
        data: {
          total_hits: 2,
          page_index: options.params.page_index,
          list: [row(String(options.params.page_index))],
        },
      },
    }));
    const params = {
      ts_code: '000001.SZ',
      start_date: '20260901',
      end_date: '20260930',
    };
    const result = await publicAnnouncements(params, get as any);
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0][3]).toBe(
      'https://data.eastmoney.com/notices/detail/000001/AN1.html',
    );
    const repeated = async (_url: any, options: any) => ({
      data: {
        success: 1,
        data: {
          total_hits: 2,
          page_index: options.params.page_index,
          list: [row('1')],
        },
      },
    });
    await expect(publicAnnouncements(params, repeated as any)).rejects.toThrow(
      '重复',
    );
    await expect(
      publicAnnouncements(params, (async () => ({
        data: { success: 1, data: { total_hits: 2, page_index: 1, list: [] } },
      })) as any),
    ).rejects.toThrow('不完整');
    await expect(
      publicAnnouncements(params, (async () => ({
        data: {
          success: 1,
          data: {
            total_hits: 1,
            page_index: 1,
            list: [{ ...row('1'), codes: [{ stock_code: '999999' }] }],
          },
        },
      })) as any),
    ).rejects.toThrow('无效');
  });
  it('keeps future announcements and future financial releases out, including reduction end dates', async () => {
    const cache = {
      read: jest.fn(async (source: string) => ({
        source,
        state: 'ready',
        fetchedAt: '2026-10-04',
        rows:
          (
            {
              eastmoney_ann: [
                {
                  ts_code: '000001.SZ',
                  ann_date: '20260930',
                  title: '减持计划',
                  url: 'https://example.com/ann',
                },
                {
                  ts_code: '000001.SZ',
                  ann_date: '20261001',
                  title: '未来消息',
                },
              ],
              fina_indicator: [
                { end_date: '20260630', ann_date: '20260820', profit_dedt: -1 },
                { end_date: '20260930', ann_date: '20261001', profit_dedt: 3 },
              ],
              fina_audit: [
                {
                  end_date: '20251231',
                  ann_date: '20260430',
                  audit_result: '保留意见',
                },
              ],
              balancesheet: [
                {
                  end_date: '20260630',
                  ann_date: '20260820',
                  report_type: '1',
                  total_hldr_eqy_exc_min_int: -10,
                },
              ],
            } as any
          )[source] || [],
      })),
    };
    const service = new WorkbenchService(
      { manager: { find: async () => [] } } as any,
      cache as any,
      {} as any,
    );
    jest
      .spyOn(service, 'risk')
      .mockResolvedValue({ items: [], sources: [], date: '2026-09-30' } as any);
    const result = await service.riskDetail({
      date: '2026-09-30',
      code: '000001.SZ',
    });
    expect(result.announcements).toHaveLength(1);
    expect(result.findings).toHaveLength(3);
    expect(result.financial?.profit_dedt).toBe(-1);
    expect(result.checks.every((check) => check.requiresReview)).toBe(true);
    expect(
      result.checks.find((check) => check.key === 'financial')?.state,
    ).toBe('leads');
    expect(
      result.checks.find((check) => check.key === 'governance')?.state,
    ).toBe('no_matches');
    expect(
      result.checks.find((check) => check.key === 'reduction')?.leads,
    ).toBe(1);
    expect(
      result.checks.find((check) => check.key === 'reduction')?.evidence,
    ).toEqual([
      {
        kind: 'announcement',
        date: '2026-09-30',
        title: '减持计划',
        url: 'https://example.com/ann',
      },
    ]);
  });
  it('distinguishes incomplete evidence from a complete search without title matches', async () => {
    const service = new WorkbenchService(
      { manager: { find: async () => [] } } as any,
      {
        read: async (source: string) => ({
          source,
          state: source === 'balancesheet' ? 'error' : 'ready',
          rows: [],
        }),
      } as any,
      {} as any,
    );
    jest
      .spyOn(service, 'risk')
      .mockResolvedValue({ items: [], sources: [], date: '2026-09-30' } as any);
    const result = await service.riskDetail({
      code: '000001.SZ',
      date: '2026-09-30',
    });
    expect(
      result.checks.find((check) => check.key === 'financial'),
    ).toMatchObject({
      state: 'incomplete',
      leads: 0,
      evidence: [],
      requiresReview: true,
    });
    expect(result.checks.find((check) => check.key === 'adverse')?.state).toBe(
      'no_matches',
    );
  });
});
