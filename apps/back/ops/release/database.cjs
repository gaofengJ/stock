/* Deployment-only CLI. Never starts Nest or imports business environment defaults. */
const ds = require('../../dist/migration-data-source').default;
const {
  syncIndexes,
  schemaIndexes,
  checkSyncSchema,
} = require('../../dist/shared/database/sync-schema');
const q = (s) => '`' + s.replace(/`/g, '``') + '`';

async function report() {
  const {
    Accounts1790467200000,
  } = require('../../dist/migrations/1790467200000-Accounts');
  const runner = ds.createQueryRunner();
  try {
    await new Accounts1790467200000().preflight(runner);
  } finally {
    await runner.release();
  }
  const [server] = await ds.query('SELECT VERSION() version, DATABASE() name');
  const tables = await ds.query(
    'SELECT TABLE_NAME name, ENGINE engine, DATA_LENGTH+INDEX_LENGTH bytes FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()',
  );
  if (tables.some((t) => t.engine && t.engine !== 'InnoDB'))
    throw new Error('Backup requires InnoDB business tables');
  let history = [];
  if (tables.some((t) => t.name === 'migrations'))
    history = await ds.query('SELECT name FROM migrations');
  const knownMigrations = ds.migrations.map(
    (m) => m.name || m.constructor.name,
  );
  if (history.some((h) => !knownMigrations.includes(h.name)))
    throw new Error(
      'Database has migrations unknown to this release; refusing a downgrade',
    );
  const indexes = await ds.query(
    'SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY SEQ_IN_INDEX',
  );
  for (const key of schemaIndexes) {
    const existing = indexes.filter(
      (i) => i.TABLE_NAME === key.table && i.INDEX_NAME === key.name,
    );
    const stateTable =
      key.table.startsWith('t_sync_') &&
      tables.some((t) => t.name === key.table);
    if (
      (existing.length || stateTable) &&
      (existing.length !== key.columns.length ||
        existing.some(
          (i, n) =>
            Number(i.NON_UNIQUE) !== 0 || i.COLUMN_NAME !== key.columns[n],
        ))
    )
      throw new Error(
        'Unexpected index definition: ' + key.table + '.' + key.name,
      );
  }
  const counts = {};
  for (const key of syncIndexes) {
    const existing = indexes.filter(
      (i) => i.TABLE_NAME === key.table && i.INDEX_NAME === key.name,
    );
    const [{ count }] = await ds.query(
      'SELECT COUNT(*) count FROM ' + q(key.table),
    );
    let duplicates = 0;
    if (!existing.length) {
      const [row] = await ds.query(
        'SELECT COALESCE(SUM(n-1),0) duplicates FROM (SELECT COUNT(*) n FROM ' +
          q(key.table) +
          ' GROUP BY ' +
          key.columns.map(q).join(',') +
          ' HAVING COUNT(*)>1) d',
      );
      duplicates = Number(row.duplicates);
    }
    counts[key.table] = { rows: Number(count), duplicates };
  }
  const totalBytes = tables.reduce((sum, t) => sum + Number(t.bytes), 0);
  return {
    database: server.name,
    version: server.version,
    totalBytes,
    requiredFreeBytes: totalBytes * 4 + 1073741824,
    pending: ds.migrations
      .filter(
        (m) => !history.some((h) => h.name === (m.name || m.constructor.name)),
      )
      .map((m) => m.name || m.constructor.name),
    tables,
    counts,
  };
}

async function main() {
  const action = process.argv[2];
  if (action === 'client-config') {
    // stdout must only be redirected to a mode-600 temporary file; never log it.
    const value = (s) => JSON.stringify(String(s || ''));
    process.stdout.write(
      '[client]\nhost=127.0.0.1\nport=' +
        ds.options.port +
        '\nuser=' +
        value(ds.options.username) +
        '\npassword=' +
        value(ds.options.password) +
        '\n',
    );
    return;
  }
  await ds.initialize();
  try {
    if (action === 'preflight')
      process.stdout.write(JSON.stringify(await report()) + '\n');
    else if (action === 'migrate') {
      // A stopped-writer preflight is required so counts describe this exact migration.
      const before = await report();
      process.stdout.write(
        JSON.stringify({ phase: 'before', ...before }) + '\n',
      );
      await ds.runMigrations();
      await checkSyncSchema(ds);
      const after = await report();
      for (const [table, counts] of Object.entries(before.counts)) {
        if (after.counts[table].rows !== counts.rows - counts.duplicates)
          throw new Error('Migration row-count mismatch: ' + table);
        if (counts.duplicates) {
          const [backup] = await ds.query(
            'SELECT COUNT(*) count FROM ' + q(table + '_sync_backup_20260926'),
          );
          if (Number(backup.count) < counts.duplicates)
            throw new Error('Missing duplicate backup: ' + table);
        }
      }
      process.stdout.write(JSON.stringify({ phase: 'after', ...after }) + '\n');
    } else if (action === 'verify') {
      await checkSyncSchema(ds);
      const [bootstrap] = await ds.query(
        "SELECT name FROM t_auth_meta WHERE name='bootstrap-v1'",
      );
      if (!bootstrap) throw new Error('Account initialization missing');
      process.stdout.write(
        JSON.stringify({ status: 'verified', database: ds.options.database }) +
          '\n',
      );
    } else throw new Error('Expected preflight, migrate or verify');
  } finally {
    await ds.destroy();
  }
}

main().catch((error) => {
  process.stderr.write(
    JSON.stringify({ error: error.code || error.message }) + '\n',
  );
  process.exitCode = 1;
});
