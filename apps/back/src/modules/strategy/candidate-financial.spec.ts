/* eslint-disable no-restricted-syntax, no-await-in-loop, camelcase */
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BasicSnapshotService } from '../basic/workbench/snapshot.service';
import { CandidateFinancialDto } from './insight.dto';
import {
  candidateProfit,
  candidateHistory,
  candidateForecast,
  CandidateFinancialService,
  CANDIDATE_FINANCIAL_FIELDS,
} from './candidate-financial.service';

describe('candidate financial display', () => {
  const rows = [
    { end_date: '20260930', ann_date: '20261020', profit_dedt: 999 },
    { end_date: '20260630', ann_date: '20260801', profit_dedt: 3 },
    {
      end_date: '20260630',
      ann_date: '20260901',
      profit_dedt: -4,
      update_flag: 1,
    },
    { end_date: '20260331', ann_date: '20260428', profit_dedt: 0 },
    { end_date: '20251231', ann_date: '20260401', profit_dedt: 8 },
    { end_date: '20250930', ann_date: '20251020', profit_dedt: -1 },
  ];
  it('shows three unique disclosed periods with latest revisions and excludes future reports', () => {
    expect(
      candidateHistory(rows, '2026-09-30').map((r) => [
        r.reportDate,
        r.amount,
        r.status,
      ]),
    ).toEqual([
      ['2026-06-30', -4, 'loss'],
      ['2026-03-31', 0, 'flat'],
      ['2025-12-31', 8, 'profit'],
    ]);
    expect(candidateProfit(rows, '2026-08-30').amount).toBe(3);
    expect(candidateProfit(rows, '2025-01-01').status).toBe('unknown');
  });
  it('never converts missing or invalid values into profitability', () => {
    for (const profit_dedt of [null, undefined, '', ' ', NaN, Infinity, true])
      expect(
        candidateProfit(
          [{ ann_date: '20260901', end_date: '20260630', profit_dedt }],
          '2026-09-30',
        ).status,
      ).toBe('unknown');
    expect(
      candidateProfit(
        [{ ann_date: '20260901', end_date: '20260630', profit_dedt: '-1' }],
        '2026-09-30',
      ).status,
    ).toBe('loss');
  });
  it('chooses the most recent forecast announcement and permits future report periods', () => {
    const forecast = candidateForecast(
      [
        { end_date: '20261231', ann_date: '20261001', type: '预增' },
        {
          end_date: '20260930',
          ann_date: '20260929',
          type: '首亏',
          net_profit_min: -300,
          net_profit_max: 0,
          p_change_min: null,
          p_change_max: '',
        },
        { end_date: '20261231', ann_date: '20260901', type: '预增' },
      ],
      '2026-09-30',
    );
    expect(forecast).toMatchObject({
      reportDate: '2026-09-30',
      announcedAt: '2026-09-29',
      type: '首亏',
      profitMin: -300,
      profitMax: 0,
      changeMin: null,
      changeMax: null,
    });
    expect(
      candidateForecast([{ ann_date: '20261001' }], '2026-09-30'),
    ).toBeNull();
  });
  it('shares cache fields and normalizes Beijing codes while retaining response identity', async () => {
    const snap = {
      rows,
      state: 'ready',
      source: 'fina_indicator',
      key: 'key',
      fetchedAt: null,
      message: null,
    };
    const snapshots = { readBatch: jest.fn(async () => [snap]) };
    const service = new CandidateFinancialService(
      snapshots as any,
      {
        manager: {
          find: async () => [{ oldCode: '430001.BJ', newCode: '920001.BJ' }],
        },
      } as any,
    );
    const result = await service.list('2026-09-30', ['430001.BJ', '920001.BJ']);
    expect(snapshots.readBatch).toHaveBeenNthCalledWith(
      1,
      'fina_indicator',
      [{ ts_code: '920001.BJ' }],
      CANDIDATE_FINANCIAL_FIELDS,
    );
    expect(result.items.map((r) => r.tsCode)).toEqual([
      '430001.BJ',
      '920001.BJ',
    ]);
    expect(result.items[0].history).toHaveLength(3);
  });
  it('reads a financial batch in one database query without awaiting the data source', async () => {
    const params = [{ ts_code: '000001.SZ' }, { ts_code: '000002.SZ' }];
    const records = params.map((p) => ({
      snapshotKey: createHash('sha256')
        .update(
          JSON.stringify(['fina_indicator', p, CANDIDATE_FINANCIAL_FIELDS]),
        )
        .digest('hex'),
      rows,
      fetchedAt: new Date(),
      retryAt: new Date(Date.now() + 60000),
      error: null,
    }));
    const manager = { findBy: jest.fn(async () => records) };
    const source = { queryData: jest.fn() };
    const service = new BasicSnapshotService(
      { manager } as any,
      source as any,
      {} as any,
    );
    const result = await service.readBatch(
      'fina_indicator',
      params,
      CANDIDATE_FINANCIAL_FIELDS,
    );
    expect(manager.findBy).toHaveBeenCalledTimes(1);
    expect(source.queryData).not.toHaveBeenCalled();
    expect(result.map((r) => r.state)).toEqual(['ready', 'ready']);
    await expect(
      service.readBatch('fina_indicator', Array(201).fill(params[0])),
    ).rejects.toThrow();
  });
  it('bounds batches and rejects malformed codes', async () => {
    for (const codes of [
      Array.from({ length: 201 }, (_, i) => `${String(i).padStart(6, '0')}.SZ`),
      ['bad'],
    ])
      expect(
        (
          await validate(
            plainToInstance(CandidateFinancialDto, {
              date: '2026-09-30',
              codes,
            }),
          )
        ).length,
      ).toBeGreaterThan(0);
  });
});
