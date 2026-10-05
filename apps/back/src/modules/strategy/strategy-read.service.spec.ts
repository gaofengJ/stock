import { StrategyReadService } from './strategy-read.service';
import { DailyService } from '../source/daily/daily.service';
import { DailyEntity } from '../source/daily/daily.entity';
import { StockHistoryEntity } from '../source/stock/stock-history.entity';

const dates = ['2026-09-30', '2026-09-29', '2026-09-28', '2026-09-25'];
const methods = [
  ['gapThreeUp', 'findGapThreeUp', 4, true],
  ['gapTwoUp', 'findGapTwoUp', 3, true],
  ['gapThreeHighTurnover', 'findGapThreeHighTurnover', 4, false],
  ['threeDaysHighVol', 'findThreeDaysHighVol', 3, true],
  ['continuousGap', 'findContinuousGap', 3, false],
  ['shadowWrap', 'findShadowWrap', 3, true],
] as const;

function fixture() {
  const rows: DailyEntity[] = [];
  let seed = 17;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let stock = 0; stock < 240; stock += 1) {
    let previous = 10;
    [...dates].reverse().forEach((tradeDate) => {
      const open = previous + Math.floor(random() * 5) - 1;
      const close = open + Math.floor(random() * 4) - 1;
      rows.push(
        Object.assign(new DailyEntity(), {
          tsCode: `${String(stock + 1).padStart(6, '0')}.SZ`,
          tradeDate,
          name: stock % 9 === 0 ? 'ST样本' : '历史名称',
          open: String(open),
          close: String(close),
          high: String(Math.max(open, close) + 1),
          low: String(Math.min(open, close)),
          preClose: String(previous),
          vol: '10000',
          amount: String(80000 + Math.floor(random() * 80000)),
          upLimit: '99',
          turnoverRateF: '8',
        }),
      );
      previous = close;
    });
  }
  const identity: any = {
    assertReady: jest.fn().mockResolvedValue(undefined),
    load: jest.fn().mockResolvedValue({
      canonical: (code: string) => code,
      listed: () => true,
      name: (code: string) => rows.find((r) => r.tsCode === code)!.name,
    }),
  };
  const db: any = {
    manager: { find: jest.fn().mockResolvedValue([]), findOneBy: jest.fn() },
    query: jest.fn(async (sql: string, args: any[]) => {
      if (sql.startsWith('SELECT ts_code code'))
        return rows
          .filter(
            (r) =>
              r.tradeDate === args[0] &&
              Number(r.close) * 2 >= Number(r.high) + Number(r.low) &&
              (!sql.includes('AND close>open') ||
                Number(r.close) > Number(r.open)),
          )
          .map((r) => ({ code: r.tsCode }));
      if (sql.startsWith('SELECT ts_code tsCode'))
        return rows.filter(
          (r) => args[0].includes(r.tradeDate) && args[1].includes(r.tsCode),
        );
      throw new Error('Unexpected query');
    }),
  };
  const full = new Map<string, Record<string, DailyEntity>>();
  rows.forEach((row) =>
    full.set(row.tsCode, { ...full.get(row.tsCode), [row.tradeDate]: row }),
  );
  return {
    rows,
    full,
    identity,
    db,
    reads: new StrategyReadService(db, identity),
    rules: new DailyService({} as any, {} as any),
  };
}

describe('interactive candidate read projection', () => {
  test.each(methods)(
    '%s preserves the existing evaluator result',
    async (key, method, count, bullish) => {
      const { full, reads, rules } = fixture();
      const window = dates.slice(0, count);
      const expected = await rules[method](window, full);
      const reduced = await reads.sequence(window, bullish, key);
      const actual = await rules[method](window, reduced);
      expect(actual.map((r) => r.tsCode).sort()).toEqual(
        expected.map((r) => r.tsCode).sort(),
      );
      expect(actual.every((r) => r.name === '历史名称')).toBe(true);
    },
  );

  test('publication/deletion readiness still fails before reading candidates', async () => {
    const { reads, identity, db } = fixture();
    identity.assertReady.mockRejectedValue(new Error('protected day'));
    await expect(reads.sequence(dates, true, 'gapThreeUp')).rejects.toThrow(
      'protected day',
    );
    expect(db.query).not.toHaveBeenCalled();
  });

  test('conflicting old/new-code prices are rejected', async () => {
    const { reads, db, rows } = fixture();
    const latest = rows.find(
      (r) =>
        r.tradeDate === dates[0] &&
        Number(r.close) > Number(r.open) &&
        Number(r.close) * 2 >= Number(r.high) + Number(r.low),
    )!;
    db.manager.find.mockResolvedValue([
      { oldCode: '920000.BJ', newCode: latest.tsCode },
    ]);
    rows.push(
      Object.assign(new DailyEntity(), latest, {
        tsCode: '920000.BJ',
        close: '999',
      }),
    );
    await expect(reads.sequence(dates, true, 'gapThreeUp')).rejects.toThrow(
      '新旧代码行情冲突',
    );
  });

  test('identity revision changing between path lookup and projection cannot produce a result', async () => {
    const { reads, db, identity } = fixture();
    db.manager.query = jest
      .fn()
      .mockResolvedValueOnce([
        { asOf: dates[0], revision: 'old', paths: ['$.stocks[1].tsCode'] },
      ])
      .mockResolvedValueOnce([]);
    identity.load.mockImplementation(
      async (_dates: string[], _codes: string[], manager: any) =>
        manager.findOneBy(StockHistoryEntity, { snapshotKey: 'identity' }),
    );
    await expect(reads.sequence(dates, true, 'gapThreeUp')).rejects.toThrow(
      '正在更新',
    );
  });
});
