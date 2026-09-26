export const syncIndexes = [
  {
    table: 't_source_daily',
    name: 'uq_daily_code_date',
    columns: ['ts_code', 'trade_date'],
  },
  {
    table: 't_source_limit',
    name: 'uq_limit_code_date_type',
    columns: ['ts_code', 'trade_date', 'limit'],
  },
  {
    table: 't_processed_senti',
    name: 'uq_senti_date',
    columns: ['trade_date'],
  },
];

export const schemaIndexes = [
  ...syncIndexes,
  {
    table: 't_sync_run',
    name: 'uq_sync_task_date',
    columns: ['task', 'trade_date'],
  },
  { table: 't_sync_day_policy', name: 'PRIMARY', columns: ['trade_date'] },
];

export async function checkSyncSchema(
  db: { query: (sql: string, parameters?: any[]) => Promise<any> },
  requireMigrations = true,
) {
  const rows = await db.query(
    'SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, COLUMN_NAME, SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY SEQ_IN_INDEX',
  );
  const errors: string[] = [];
  schemaIndexes.forEach((index) => {
    const found = rows.filter(
      (row: any) =>
        row.TABLE_NAME === index.table && row.INDEX_NAME === index.name,
    );
    if (
      found.length !== index.columns.length ||
      found.some(
        (row: any, n: number) =>
          Number(row.NON_UNIQUE) !== 0 || row.COLUMN_NAME !== index.columns[n],
      )
    )
      errors.push(index.name);
  });
  const columns = await db.query(
    "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('t_sync_run','t_sync_day_policy')",
  );
  // eslint-disable-next-line no-restricted-syntax
  for (const [table, required] of Object.entries({
    t_sync_run: [
      'id',
      'created_at',
      'updated_at',
      'task',
      'trade_date',
      'status',
      'attempts',
      'daily_count',
      'limit_count',
      'senti_count',
      'error',
    ],
    t_sync_day_policy: ['trade_date', 'reason'],
  })) {
    if (
      required.some(
        (name) =>
          !columns.some(
            (row: any) => row.TABLE_NAME === table && row.COLUMN_NAME === name,
          ),
      )
    )
      errors.push(table);
  }
  if (requireMigrations) {
    try {
      const migrations = await db.query('SELECT name FROM migrations');
      if (
        !['ReliableSync1790380800000', 'SyncSafety1790380800001'].every(
          (name) => migrations.some((row: any) => row.name === name),
        )
      )
        errors.push('migration history');
    } catch {
      errors.push('migration history');
    }
  }
  if (errors.length)
    throw new Error(
      `数据库迁移未完成或结构异常，请先执行迁移：${errors.join(', ')}`,
    );
}
