import { planReleaseSpace } from './release-space';

const GiB = 1024 ** 3;
const tables = [
  { name: 't_source_daily', bytes: String(3 * GiB) },
  { name: 't_auth_audit', bytes: '49152' },
  { name: 't_user', bytes: 16384 },
];
const total = 3 * GiB + 65536;

describe('Release disk space budget', () => {
  it('keeps the full backup without budgeting a rebuild of market tables for translations', () => {
    expect(
      planReleaseSpace(tables, ['NewsTranslations1791072000000']),
    ).toMatchObject({
      requiredFreeBytes: total * 2 + GiB,
      spaceBudget: {
        affectedTables: ['t_news_translation'],
        migrationBytes: 0,
        unprofiled: [],
      },
    });
  });
  it.each([
    'ExpandedNewsSources1790832000000',
    'NewsDisplayPolicy1790835600000',
  ])(
    'keeps the full backup while budgeting only source configuration for %s',
    (migration) => {
      const sourceTables = [...tables, { name: 't_news_source', bytes: 16384 }];
      expect(planReleaseSpace(sourceTables, [migration])).toMatchObject({
        requiredFreeBytes: (total + 16384) * 2 + 16384 * 2 + GiB,
        spaceBudget: {
          migrationBytes: 16384 * 2,
          affectedTables: ['t_news_source'],
          unprofiled: [],
        },
      });
    },
  );
  it('reserves a full backup but only account-table workspace for login activity', () => {
    expect(
      planReleaseSpace(tables, ['LoginActivity1790640000000']),
    ).toMatchObject({
      totalBytes: total,
      requiredFreeBytes: total * 2 + 65536 * 2 + GiB,
      spaceBudget: {
        backupBytes: total * 2,
        migrationBytes: 65536 * 2,
        reserveBytes: GiB,
        unprofiled: [],
      },
    });
  });

  it('retains the old four-times allowance for historical data migrations', () => {
    expect(
      planReleaseSpace(tables, ['ReliableSync1790380800000']),
    ).toMatchObject({
      requiredFreeBytes: total * 4 + GiB,
      spaceBudget: { mode: 'full-database' },
    });
  });

  it('keeps the full backup without reserving a raw-price rebuild for new market tables', () => {
    const marketTables = [
      ...tables,
      { name: 't_permission', bytes: 16384 },
      { name: 't_role_permission', bytes: 16384 },
    ];
    expect(
      planReleaseSpace(marketTables, [
        'MarketBreadth1790899200000',
        'ThsSectors1790985600000',
      ]),
    ).toMatchObject({
      requiredFreeBytes: (total + 32768) * 2 + 32768 * 2 + GiB,
      spaceBudget: {
        backupBytes: (total + 32768) * 2,
        migrationBytes: 32768 * 2,
        reserveBytes: GiB,
        mode: 'affected-tables',
        unprofiled: [],
      },
    });
  });

  it('also budgets existing market tables when recovering a partially applied migration', () => {
    const marketTables = [
      ...tables,
      { name: 't_processed_market_breadth', bytes: 16384 },
      { name: 't_source_ths_sector', bytes: 16384 },
      { name: 't_source_ths_members', bytes: 32768 },
      { name: 't_source_ths_daily', bytes: GiB },
      { name: 't_permission', bytes: 16384 },
      { name: 't_role_permission', bytes: 16384 },
    ];
    const marketBytes = GiB + 98304;
    expect(
      planReleaseSpace(marketTables, [
        'MarketBreadth1790899200000',
        'ThsSectors1790985600000',
      ]),
    ).toMatchObject({
      requiredFreeBytes: (total + marketBytes) * 2 + marketBytes * 2 + GiB,
      spaceBudget: { migrationBytes: marketBytes * 2, unprofiled: [] },
    });
  });

  it('falls back conservatively when a new migration has no reviewed profile', () => {
    expect(
      planReleaseSpace(tables, [
        'LoginActivity1790640000000',
        'FutureMigration1800000000000',
      ]),
    ).toMatchObject({
      requiredFreeBytes: total * 4 + GiB,
      spaceBudget: { unprofiled: ['FutureMigration1800000000000'] },
    });
  });

  it('reserves the full backup and headroom even with no pending migrations', () => {
    expect(planReleaseSpace(tables, [])).toMatchObject({
      requiredFreeBytes: total * 2 + GiB,
      spaceBudget: { migrationBytes: 0 },
    });
  });

  it.each([-1, NaN, Infinity, 0.5, 'invalid'])(
    'rejects invalid table size %s',
    (bytes) => {
      expect(() => planReleaseSpace([{ name: 'table', bytes }], [])).toThrow(
        'Invalid table size',
      );
    },
  );

  it('rejects unsafe arithmetic instead of underestimating the budget', () => {
    expect(() =>
      planReleaseSpace([{ name: 'table', bytes: Number.MAX_SAFE_INTEGER }], []),
    ).toThrow('safe integer range');
  });
});
