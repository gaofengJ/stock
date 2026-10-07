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
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-06T04:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());
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

  it('uses current original plans rather than selected-day actual trades and expires cached plans after midnight', async () => {
    const row = (holder: string, patch: Record<string, any> = {}) => ({
      ts_code: '000001.SZ',
      holder_names: [holder],
      ann_date: '20260901',
      plan_start: '20260921',
      plan_end: '20261006',
      plan_status: 'active',
      title: '股东减持计划预披露',
      plan_id: holder,
      ...patch,
    });
    const active = row('股东乙', { ann_date: '20261001' });
    const data = [
      row('股东甲'),
      row('股东甲', {
        ann_date: '20260930',
        plan_end: '20260930',
        plan_status: 'ended',
      }),
      active,
      { ...active },
      row('股东丙', { plan_start: '20261007', plan_end: '20261220' }),
      row('股东丁', { plan_end: null, plan_status: 'unknown' }),
      row('股东戊', { ann_date: '20261001', plan_status: '已提前终止' }),
    ];
    const read = jest.fn(async (source: string) => ({
      source,
      state: 'ready',
      rows: source === 'reduction_plans' ? data : [],
    }));
    const service = new WorkbenchService(
      {
        manager: {
          find: async () => [],
          findOneBy: async (entity: any) =>
            entity === StockEntity ? { name: '样本' } : null,
        },
      } as any,
      {
        read,
      } as any,
      {} as any,
    );
    const result = await service.risk({ date, code: '000001.SZ' });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].holderName).toBe('股东乙');
    expect(new Set(result.items.map((r) => r.recordId)).size).toBe(
      result.items.length,
    );
    expect(result).not.toHaveProperty('reductionHistory');
    expect(result.reductionDate).toBe('2026-10-06');
    expect(
      read.mock.calls.some(([source]) => source === 'stk_holdertrade'),
    ).toBe(false);
    expect(result.reductionCoverage).toEqual({
      active: 1,
      unknown: 1,
      unknownCodes: ['000001.SZ'],
    });
    expect(currentReduction(result.items[0], result.reductionDate)).toBe(true);
    expect(
      currentReduction(
        { ...result.items[0], recordKind: 'actual' },
        result.reductionDate,
      ),
    ).toBe(false);
    expect(
      observedRisk(result.items, '000001.SZ', '', result.reductionDate).state,
    ).toBe('excluded');
    expect(
      observedRisk(
        [{ ...result.items[0], reductionState: 'ended' }],
        '000001.SZ',
        '',
        result.reductionDate,
      ).state,
    ).toBe('pending');
    expect(
      observedRisk(result.items, '000001.SZ', '', '2026-10-07').state,
    ).toBe('pending');
    jest.setSystemTime(new Date('2026-10-06T16:01:00Z'));
    const tomorrow = await service.risk({ date, code: '000001.SZ' });
    expect(tomorrow.reductionDate).toBe('2026-10-07');
    expect(tomorrow.items.map((r) => r.holderName)).toEqual(['股东丙']);
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
    expect(check.evidence).toEqual([]);
    expect(check).not.toHaveProperty('historicalEvidence');
    expect(result.announcements).toHaveLength(2);
  });
});
