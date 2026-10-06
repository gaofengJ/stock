import { StockEntity } from '@/modules/source/stock/stock.entity';
import {
  currentReduction,
  reductionState,
  terminalReduction,
} from './reduction-state';
import { WorkbenchService } from './workbench.service';
import { observedRisk } from './risk-rules';

const date = '2026-09-30';
const period = {
  ann_date: '20260901',
  begin_date: '20260902',
  close_date: '20261002',
};

describe('current reduction periods across platform risk consumers', () => {
  it('requires disclosed valid dates and separates active, ended, upcoming and unknown', () => {
    expect(reductionState(period, date)).toBe('active');
    expect(
      reductionState(
        { ...period, begin_date: '20260930', close_date: '20260930' },
        date,
      ),
    ).toBe('active');
    expect(reductionState({ ...period, close_date: '20260929' }, date)).toBe(
      'ended',
    );
    expect(reductionState({ ...period, begin_date: '20261001' }, date)).toBe(
      'upcoming',
    );
    expect(reductionState({ ...period, close_date: null }, date)).toBe(
      'unknown',
    );
    expect(reductionState({ ...period, begin_date: null }, date)).toBe(
      'unknown',
    );
    expect(reductionState({ ...period, begin_date: '20260230' }, date)).toBe(
      'unknown',
    );
    expect(reductionState({ ...period, begin_date: '20261003' }, date)).toBe(
      'unknown',
    );
    expect(reductionState({ ...period, ann_date: '20261001' }, date)).toBe(
      'unknown',
    );
    expect(reductionState({ ...period, plan_status: '已提前终止' }, date)).toBe(
      'ended',
    );
    expect(reductionState({ ...period, plan_status: '尚未完成' }, date)).toBe(
      'active',
    );
    expect(terminalReduction('减持计划实施完毕')).toBe(true);
    expect(terminalReduction('减持计划尚未完成')).toBe(false);
  });

  it('removes expired, superseded and undated rows from tags and review exclusion, retaining history', async () => {
    const row = (holder: string, patch: Record<string, any> = {}) => ({
      ...period,
      ts_code: '000001.SZ',
      holder_name: holder,
      in_de: 'DE',
      ...patch,
    });
    const active = row('股东乙');
    const data = [
      row('股东甲'),
      row('股东甲', { ann_date: '20260930', close_date: '20260929' }),
      active,
      { ...active },
      row('股东丙', { begin_date: '20261001' }),
      row('股东丁', { close_date: null }),
      row('股东戊', { ann_date: '20261001' }),
    ];
    const service = new WorkbenchService(
      {
        manager: {
          find: async () => [],
          findOneBy: async (entity: any) =>
            entity === StockEntity ? { name: '样本' } : null,
        },
      } as any,
      {
        read: async (source: string) => ({
          source,
          state: 'ready',
          rows: source === 'stk_holdertrade' ? data : [],
        }),
      } as any,
      {} as any,
    );
    const result = await service.risk({ date, code: '000001.SZ' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].holderName).toBe('股东乙');
    expect(new Set(result.items.map((r) => r.recordId)).size).toBe(
      result.items.length,
    );
    expect(result.reductionHistory).toHaveLength(5);
    expect(
      result.reductionHistory
        ?.filter((r) => r.holderName === '股东甲')
        .map((r) => r.reductionState)
        .sort(),
    ).toEqual(['ended', 'superseded']);
    expect(
      result.reductionHistory?.some((r) => r.holderName === '股东戊'),
    ).toBe(false);
    expect(result.reductionCoverage).toEqual({ active: 1, unknown: 1 });
    expect(currentReduction(result.items[0], date)).toBe(true);
    expect(observedRisk(result.items, '000001.SZ', '', date).state).toBe(
      'excluded',
    );
    expect(
      observedRisk(
        result.reductionHistory!.filter((r) => r.reductionState !== 'active'),
        '000001.SZ',
        '',
        date,
      ).state,
    ).toBe('pending');
    expect(
      observedRisk(result.items, '000001.SZ', '', '2026-10-03').state,
    ).toBe('pending');
  });

  it('keeps completed announcements separate from possible plan leads and preserves future boundaries', async () => {
    const service = new WorkbenchService(
      { manager: { find: async () => [] } } as any,
      {
        read: async (source: string) => ({
          source,
          state: 'ready',
          rows:
            source === 'eastmoney_ann'
              ? [
                  {
                    ts_code: '000001.SZ',
                    ann_date: '20260929',
                    title: '股东减持计划实施完毕',
                  },
                  {
                    ts_code: '000001.SZ',
                    ann_date: '20260930',
                    title: '股东乙减持计划预披露',
                  },
                  {
                    ts_code: '000001.SZ',
                    ann_date: '20261001',
                    title: '未来减持计划',
                  },
                ]
              : [],
        }),
      } as any,
      {} as any,
    );
    jest
      .spyOn(service, 'risk')
      .mockResolvedValue({ date, items: [], sources: [] } as any);
    const result = await service.riskDetail({ date, code: '000001.SZ' });
    const check = result.checks.find((r) => r.key === 'reduction')!;
    expect(check.activeCount).toBe(0);
    expect(check.evidence.map((r) => r.title)).toEqual([
      '股东乙减持计划预披露',
    ]);
    expect(check.historicalEvidence?.map((r) => r.title)).toEqual([
      '股东减持计划实施完毕',
    ]);
    expect(result.announcements).toHaveLength(2);
  });
});
