interface TableSize {
  name: string;
  bytes: string | number | null;
}

const migrationTables: Record<string, readonly string[]> = {
  IntradayCounts1791331200000: ['t_market_intraday_counts'],
  StrategyTrend1791417600000: ['t_source_strategy_factor'],
  StockIdentity1791244800000: ['t_source_stock_history'],
  ReliableSync1790380800000: [],
  Accounts1790467200000: [],
  SyncSafety1790380800001: ['t_sync_day_policy'],
  AccountAvatars1790467200001: ['t_user'],
  MarketAnalysis1790553600000: [
    't_source_index_daily',
    't_processed_market_daily',
    't_source_bse_mapping',
    't_admin_job',
    't_permission',
    't_role_permission',
  ],
  DragonPermission1790812800000: ['t_permission', 't_role_permission'],
  RealTimeNews1790812800001: [
    't_news_source',
    't_news_item',
    't_news_favorite',
    't_permission',
    't_role_permission',
  ],
  // Adds only source configuration rows; no business-data DDL or rebuild.
  ExpandedNewsSources1790832000000: ['t_news_source'],
  NewsDisplayPolicy1790835600000: ['t_news_source'],
  // Creates a new child table; does not rebuild existing news or market tables.
  NewsTranslations1791072000000: ['t_news_translation'],
  NewsReadingFeatures1791158400000: [
    't_news_rule',
    't_news_stock',
    't_news_preference',
    't_news_read',
  ],
  // Creates a new aggregate table without changing or rebuilding raw prices.
  MarketBreadth1790899200000: ['t_processed_market_breadth'],
  // Creates three source tables and inserts module permissions; no price-table DDL.
  ThsSectors1790985600000: [
    't_source_ths_sector',
    't_source_ths_members',
    't_source_ths_daily',
    't_permission',
    't_role_permission',
  ],
  LoginActivity1790640000000: [
    't_auth_audit',
    't_auth_activity_read',
    't_user',
  ],
};

// A deliberate review is required for each migration, including historical ones.
// These two legacy migrations copy/deduplicate data or restructure legacy accounts.
const migrationOperations: Record<
  string,
  'create' | 'data' | 'schema' | 'full-database'
> = {
  IntradayCounts1791331200000: 'create',
  StrategyTrend1791417600000: 'create',
  StockIdentity1791244800000: 'create',
  ReliableSync1790380800000: 'full-database',
  Accounts1790467200000: 'full-database',
  SyncSafety1790380800001: 'create',
  AccountAvatars1790467200001: 'schema',
  MarketAnalysis1790553600000: 'schema',
  DragonPermission1790812800000: 'data',
  RealTimeNews1790812800001: 'create',
  LoginActivity1790640000000: 'schema',
  ExpandedNewsSources1790832000000: 'data',
  NewsDisplayPolicy1790835600000: 'data',
  NewsTranslations1791072000000: 'create',
  NewsReadingFeatures1791158400000: 'create',
  MarketBreadth1790899200000: 'create',
  ThsSectors1790985600000: 'create',
};

export function validateMigrationProfiles(names: string[]) {
  const missing = names.filter(
    (name) =>
      !Object.prototype.hasOwnProperty.call(migrationTables, name) ||
      !Object.prototype.hasOwnProperty.call(migrationOperations, name),
  );
  if (missing.length)
    throw new Error(
      `Missing reviewed migration space profile: ${missing.join(', ')}`,
    );
  return names.map((name) => ({
    name,
    operation: migrationOperations[name],
    tables: migrationTables[name],
  }));
}

export function planReleaseSpace(tables: TableSize[], pending: string[]) {
  const profiles = validateMigrationProfiles(pending);
  const sizes = tables.map((table) => {
    const bytes = Number(table.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new Error(`Invalid table size: ${table.name}`);
    return { name: table.name, bytes };
  });
  const totalBytes = sizes.reduce((sum, table) => sum + table.bytes, 0);
  if (!Number.isSafeInteger(totalBytes))
    throw new Error('Release space budget exceeds the safe integer range');
  const fullDatabase = profiles.some(
    (profile) => profile.operation === 'full-database',
  );
  const affectedTables = new Set(
    pending.flatMap((name) => migrationTables[name] || []),
  );
  const workspaceBytes = fullDatabase
    ? totalBytes
    : sizes.reduce(
        (sum, table) =>
          sum + (affectedTables.has(table.name) ? table.bytes : 0),
        0,
      );
  // Schema migrations need a fresh stopped-writer backup. Application releases
  // reuse a verified recent independent backup and do not export another copy.
  const backupBytes = pending.length ? totalBytes * 2 : 0;
  const migrationBytes = workspaceBytes * 2;
  const reserveBytes = 1024 ** 3;
  const requiredFreeBytes = backupBytes + migrationBytes + reserveBytes;
  if (!Number.isSafeInteger(requiredFreeBytes))
    throw new Error('Release space budget exceeds the safe integer range');
  return {
    totalBytes,
    releaseMode: pending.length ? 'migration' : 'application',
    profiles,
    requiredFreeBytes,
    spaceBudget: {
      backupBytes,
      migrationBytes,
      reserveBytes,
      mode: fullDatabase ? 'full-database' : 'affected-tables',
      affectedTables: Array.from(affectedTables),
      unprofiled: [],
    },
  };
}
