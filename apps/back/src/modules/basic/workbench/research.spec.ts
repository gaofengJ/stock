import 'reflect-metadata';
import { ACCESS } from '@/modules/auth/permissions';
import { TushareService } from '@/shared/tushare/tushare.service';
import { ResearchController } from './research.controller';
import { ResearchService } from './research.service';
import { ResearchSourceService } from './research-source.service';
import {
  announcedRows,
  disclosedRows,
  financialHistory,
  holderChanges,
  researchNumber,
} from './research-rules';

describe('live research disclosure and completeness', () => {
  it('rejects disclosures and revisions later than the observation date, but keeps future event expiry dates', () => {
    const rows = [
      { ann_date: '20260701', end_date: '20261231' },
      { ann_date: '20261001', end_date: '20260630' },
      { ann_date: '20260701', f_ann_date: '20261001', end_date: '20260630' },
      { ann_date: '20260701', end_date: '20260630' },
    ];
    expect(disclosedRows(rows, '2026-09-30')).toEqual([rows[3]]);
    expect(announcedRows(rows.slice(0, 2), '2026-09-30')).toEqual([rows[0]]);
  });

  it('aligns all four financial sources by report period without manufacturing zeros or choosing single-quarter reports', () => {
    const result = financialHistory(
      [
        {
          source: 'income',
          rows: [
            {
              end_date: '20260630',
              ann_date: '20260801',
              report_type: '1',
              revenue: 100,
            },
            {
              end_date: '20260630',
              ann_date: '20260802',
              report_type: '2',
              revenue: 999,
            },
            {
              end_date: '20260630',
              ann_date: '20261001',
              report_type: '1',
              revenue: 888,
            },
          ],
        },
        {
          source: 'fina_indicator',
          rows: [{ end_date: '20260331', ann_date: '20260428', roe: 0 }],
        },
        {
          source: 'cashflow',
          rows: [
            { end_date: '20260630', ann_date: '20260801', n_cashflow_act: -10 },
          ],
        },
        {
          source: 'balancesheet',
          rows: [
            { end_date: '20260630', ann_date: '20260801', total_assets: 200 },
          ],
        },
      ],
      '2026-09-30',
    );
    expect(result[0]).toMatchObject({
      revenue: 100,
      roe: null,
      total_assets: 200,
      n_cashflow_act: -10,
    });
    expect(result[1]).toMatchObject({
      revenue: null,
      roe: 0,
      n_cashflow_act: null,
    });
    [null, '', ' ', false, NaN, {}, []].forEach((v) =>
      expect(researchNumber(v)).toBeNull(),
    );
  });

  it('compares adjacent disclosed shareholder snapshots; exit from top ten is not reported as liquidation', () => {
    const result = holderChanges(
      [
        {
          end_date: '20260630',
          ann_date: '20260801',
          holder_name: 'A',
          hold_amount: 120,
        },
        {
          end_date: '20260630',
          ann_date: '20260801',
          holder_name: 'B',
          hold_amount: 10,
        },
        {
          end_date: '20260331',
          ann_date: '20260428',
          holder_name: 'A',
          hold_amount: 100,
        },
        {
          end_date: '20260331',
          ann_date: '20260428',
          holder_name: 'C',
          hold_amount: 20,
        },
        {
          end_date: '20260930',
          ann_date: '20261028',
          holder_name: 'D',
          hold_amount: 999,
        },
      ],
      '2026-09-30',
    );
    expect(result.rows[0]).toMatchObject({
      change_amount: 20,
      change_label: '数量增加',
    });
    expect(result.rows[1]).toMatchObject({
      change_amount: null,
      change_label: '新进前十',
    });
    expect(result.exited[0]).toMatchObject({
      holder_name: 'C',
      change_label: '退出前十',
    });
  });

  it('does not mutate a coalesced monthly response when two stock queries overlap', async () => {
    const shared = {
      source: 'broker_recommend',
      state: 'ready',
      rows: [
        { ts_code: '000001.SZ', month: '202609', broker: 'A' },
        { ts_code: '600000.SH', month: '202609', broker: 'B' },
      ],
    };
    const reader = {
      read: jest.fn(async (name) =>
        name === 'broker_recommend'
          ? shared
          : { source: name, state: 'error', rows: [], message: '暂不可用' },
      ),
    };
    const service = new ResearchService(reader as any);
    const results = await Promise.all(
      ['000001.SZ', '600000.SH'].map((code) =>
        service.stock({ code, date: '2026-09-30', section: 'institutions' }),
      ),
    );
    expect(results[0].sources[1].rows[0].broker).toBe('A');
    expect(results[1].sources[1].rows[0].broker).toBe('B');
    expect(shared.rows).toHaveLength(2);
    expect(results[0].sources[0].state).toBe('error');
  });

  it('filters event disclosures without dropping future scheduled deadlines or exposing future releases', async () => {
    const service = new ResearchService({
      read: async (name: string) => ({
        source: name,
        state: 'ready',
        rows: [
          {
            ts_code: '000001.SZ',
            ann_date: '20260901',
            end_date: '20271231',
            release_date: '20261201',
            is_release: 'Y',
          },
        ],
      }),
    } as any);
    const result = await service.stock({
      code: '000001.SZ',
      date: '2026-09-30',
      section: 'capital',
    });
    expect(
      result.sources.find((s) => s.source === 'pledge_detail')?.rows[0],
    ).toMatchObject({
      end_date: '20271231',
      release_date: null,
      is_release: null,
    });
    expect(
      result.sources.find((s) => s.source === 'repurchase')?.rows,
    ).toHaveLength(1);
  });

  it('uses the existing page permissions on all new endpoints', () => {
    expect(
      Reflect.getMetadata(ACCESS, ResearchController.prototype.stock),
    ).toEqual({ any: ['basic:stock'] });
    expect(
      Reflect.getMetadata(ACCESS, ResearchController.prototype.sectors),
    ).toEqual({ any: ['analysis:sectors'] });
    expect(
      Reflect.getMetadata(ACCESS, ResearchController.prototype.market),
    ).toEqual({ any: ['analysis:overview'] });
  });

  it('rejects invalid dates and future monthly selections before source reads', async () => {
    const read = jest.fn();
    const service = new ResearchService({ read } as any);
    await expect(
      service.stock({
        code: '000001.SZ',
        date: '2026-02-30',
        section: 'funds',
      }),
    ).rejects.toThrow('有效');
    await expect(
      service.stock({
        code: '000001.SZ',
        date: '2026-09-30',
        section: 'institutions',
        month: '2026-10',
      }),
    ).rejects.toThrow('月份');
    expect(read).not.toHaveBeenCalled();
  });
});

describe('direct source reader', () => {
  it('coalesces in-flight reads, clears them after completion and isolates failures', async () => {
    const queryLiveData = jest.fn(async () => ({
      fields: ['ts_code'],
      items: [['000001.SZ']],
    }));
    const reader = new ResearchSourceService({ queryLiveData } as any);
    const first = reader.read('test', {}, 'ts_code', 100);
    const second = reader.read('test', {}, 'ts_code', 100);
    expect(await first).toEqual(await second);
    expect(queryLiveData).toHaveBeenCalledTimes(1);
    await reader.read('test', {}, 'ts_code', 100);
    expect(queryLiveData).toHaveBeenCalledTimes(2);
    queryLiveData.mockRejectedValueOnce(new Error('权限不足 secret-token'));
    const failed = await reader.read('restricted', {}, 'ts_code', 100);
    expect(failed).toMatchObject({ state: 'error', rows: [] });
    expect(failed.message).toContain('权限不足');
    expect(failed.message).not.toContain('secret-token');
  });

  it('treats missing fields as errors rather than successful empty results', async () => {
    const reader = new ResearchSourceService({
      queryLiveData: async () => ({ fields: ['wrong'], items: [] }),
    } as any);
    expect((await reader.read('test', {}, 'ts_code', 100)).state).toBe('error');
  });

  it('reads offsets until complete and rejects repeated or truncated pages', async () => {
    const request = jest
      .fn()
      .mockResolvedValueOnce({
        data: { code: 0, data: { fields: ['v'], items: [[1], [2]] } },
      })
      .mockResolvedValueOnce({
        data: { code: 0, data: { fields: ['v'], items: [[3]] } },
      });
    const service = new TushareService({ axiosRef: { request } } as any);
    expect(
      (await service.queryLiveData('test', {}, 'v', 2, Date.now() + 5000))
        .items,
    ).toEqual([[1], [2], [3]]);
    expect(request.mock.calls[1][0].data.params.offset).toBe(2);
    request.mockReset().mockResolvedValue({
      data: { code: 0, data: { fields: ['v'], items: [[1], [2]] } },
    });
    await expect(
      service.queryLiveData('test', {}, 'v', 2, Date.now() + 5000),
    ).rejects.toThrow('重复');
    await expect(
      service.queryLiveData('test', {}, 'v', 2, Date.now() - 1),
    ).rejects.toThrow('超时');
  });
});
