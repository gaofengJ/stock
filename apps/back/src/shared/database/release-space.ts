interface TableSize {
  name: string;
  bytes: string | number | null;
}

// Only migrations with reviewed DDL may use a table-specific workspace budget.
// Historical or newly added migrations retain the full-database allowance.
const migrationTables: Record<string, readonly string[]> = {
  // Adds only source configuration rows; no business-data DDL or rebuild.
  ExpandedNewsSources1790832000000: ['t_news_source'],
  NewsDisplayPolicy1790835600000: ['t_news_source'],
  LoginActivity1790640000000: [
    't_auth_audit',
    't_auth_activity_read',
    't_user',
  ],
};

export function planReleaseSpace(tables: TableSize[], pending: string[]) {
  const sizes = tables.map((table) => {
    const bytes = Number(table.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0)
      throw new Error(`Invalid table size: ${table.name}`);
    return { name: table.name, bytes };
  });
  const totalBytes = sizes.reduce((sum, table) => sum + table.bytes, 0);
  const unprofiled = pending.filter(
    (name) => !Object.prototype.hasOwnProperty.call(migrationTables, name),
  );
  const affectedTables = new Set(
    pending.flatMap((name) => migrationTables[name] || []),
  );
  const workspaceBytes = unprofiled.length
    ? totalBytes
    : sizes.reduce(
        (sum, table) =>
          sum + (affectedTables.has(table.name) ? table.bytes : 0),
        0,
      );
  // The full streamed gzip backup is still required for every deployment.
  const backupBytes = totalBytes * 2;
  const migrationBytes = workspaceBytes * 2;
  const reserveBytes = 1024 ** 3;
  const requiredFreeBytes = backupBytes + migrationBytes + reserveBytes;
  if (!Number.isSafeInteger(requiredFreeBytes))
    throw new Error('Release space budget exceeds the safe integer range');
  return {
    totalBytes,
    requiredFreeBytes,
    spaceBudget: {
      backupBytes,
      migrationBytes,
      reserveBytes,
      mode: unprofiled.length ? 'full-database' : 'affected-tables',
      affectedTables: Array.from(affectedTables),
      unprofiled,
    },
  };
}
