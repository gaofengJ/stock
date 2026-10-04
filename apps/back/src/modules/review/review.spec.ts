/* eslint-disable no-restricted-syntax, no-await-in-loop, no-script-url */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { HoldingsDto } from './review.dto';
import { capStatus, ma5Observation } from './review-rules';
import { ReviewService } from './review.service';
import {
  announcementCategories,
  observedRisk,
  safeAnnouncementUrl,
} from '../basic/workbench/risk-rules';

const series = (prices: (number | null)[]) =>
  prices.map((close, i) => ({
    date: `2026-09-${String(23 + i).padStart(2, '0')}`,
    close,
  }));
describe('personal review', () => {
  it('uses ten-thousand-CNY units and does not turn missing caps into small caps', () => {
    expect(capStatus('1999999')).toBe('within');
    expect(capStatus(2000000)).toBe('outside');
    [null, undefined, '', 0, -1, 'nan'].forEach((value) =>
      expect(capStatus(value)).toBe('missing'),
    );
  });
  it('compares each close with its own MA5 and waits for the next close', () => {
    expect(
      ma5Observation(series([10, 10, 10, 10, 10, 9]), '2026-09-28').state,
    ).toBe('watch');
    expect(
      ma5Observation(series([10, 10, 10, 10, 9, 8]), '2026-09-28').state,
    ).toBe('unrecovered');
    expect(
      ma5Observation(series([10, 10, 10, 10, 9, 10]), '2026-09-28').state,
    ).toBe('recovered');
    expect(
      ma5Observation(series([10, 10, 10, 10, 10, 10]), '2026-09-28').state,
    ).toBe('above');
    expect(
      ma5Observation(series([10, 10, null, 10, 9, 8]), '2026-09-28').state,
    ).toBe('missing');
    expect(
      ma5Observation(series([10, 10, 10, 10, 9, 8]), '2026-09-29').state,
    ).toBe('missing');
  });
  it('treats empty source feeds as unresolved and separates title leads from facts', () => {
    expect(observedRisk([], '000001.SZ').state).toBe('pending');
    expect(observedRisk([], '000001.SZ', '*ST样本').state).toBe('excluded');
    expect(
      observedRisk([{ tsCode: '000001.SZ', type: '减持' }], '000001.SZ').state,
    ).toBe('excluded');
    expect(
      observedRisk([{ tsCode: '000001.SZ', type: '复牌' }], '000001.SZ').state,
    ).toBe('pending');
    expect(announcementCategories('股东减持计划实施完成')).toContain(
      'reduction',
    );
    expect(announcementCategories('公司涉嫌重大违法强制退市')).toContain(
      'delisting',
    );
    expect(safeAnnouncementUrl('javascript:alert(1)')).toBeNull();
  });
  it('discovers every registry strategy, merges overlaps, sorts caps and shows source failures', async () => {
    const tabs = ['existing', 'newStrategy', 'failed'].map((key) => ({
      key,
      label: key,
    }));
    const strategies = {
      navList: async () => tabs,
      list: jest.fn(async ({ strategyType }) => {
        if (strategyType === 'failed') throw new Error('unavailable');
        return strategyType === 'existing'
          ? [{ tsCode: '000001.SZ', totalMv: '100000', circMv: 50 }]
          : [
              { tsCode: '000001.SZ', totalMv: '100000', circMv: 50 },
              { tsCode: '600000.SH', totalMv: '100000', circMv: 20 },
              { tsCode: '600001.SH', totalMv: null, circMv: null },
            ];
      }),
    };
    const service = new ReviewService(
      { query: async () => [{}] } as any,
      strategies as any,
      {} as any,
      { risk: async () => ({ items: [], sources: [] }) } as any,
    );
    const result = await service.report('2026-09-30');
    expect(strategies.list).toHaveBeenCalledTimes(3);
    expect(result.complete).toBe(false);
    expect(result.items.map((r) => r.tsCode)).toEqual([
      '600000.SH',
      '000001.SZ',
      '600001.SH',
    ]);
    expect(result.items[1].strategies).toHaveLength(2);
    expect(result.items[2].capState).toBe('missing');
    expect(result.strategies[2].count).toBeNull();
    expect(result).not.toHaveProperty('holdings');
  });
  it('validates holding bounds, duplicate codes and nested values', async () => {
    const invalid = [
      [],
      [null],
      Array(4).fill({ code: '000001.SZ' }),
      [{ code: 'bad' }],
      [{ code: '000001.SZ', cost: -1 }],
      [{ code: '000001.SZ', boughtOn: '2026-02-30' }],
    ];
    for (const holdings of invalid) {
      // eslint-disable-next-line no-await-in-loop
      expect(
        (
          await validate(
            plainToInstance(HoldingsDto, { date: '2026-09-30', holdings }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
    expect(
      await validate(
        plainToInstance(HoldingsDto, {
          date: '2026-09-30',
          holdings: [{ code: '000001.SZ' }],
        }),
      ),
    ).toEqual([]);
  });
  it('does not infer costs or purchase dates, and does not write holdings', async () => {
    const db = {
      query: jest.fn(async (sql: string) =>
        sql.includes('SELECT name') ? [{ name: '样本', close: 8 }] : [{}],
      ),
    };
    const trend = {
      chart: async () => ({
        code: '000001.SZ',
        basis: '后复权',
        series: series([10, 10, 10, 10, 9, 8]),
      }),
    };
    const service = new ReviewService(
      db as any,
      {} as any,
      trend as any,
      {} as any,
    );
    const result = await service.holdings({
      date: '2026-09-28',
      holdings: [{ code: '000001.SZ' }],
    });
    expect(result.items[0]).toMatchObject({
      heldDays: null,
      profitPct: null,
      ma5: { state: 'unrecovered' },
    });
    expect(db.query.mock.calls.every(([sql]) => sql.startsWith('SELECT'))).toBe(
      true,
    );
    await expect(
      service.holdings({
        date: '2026-09-28',
        holdings: [{ code: '000001.SZ', boughtOn: '2026-09-30' }],
      }),
    ).rejects.toThrow('买入日期');
  });
});
