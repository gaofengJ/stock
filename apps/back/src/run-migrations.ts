import dataSource from './migration-data-source';

async function main() {
  try {
    await dataSource.initialize();
    if (process.argv.includes('--show')) {
      console.info(
        (await dataSource.showMigrations())
          ? 'Pending migrations exist'
          : 'No pending migrations',
      );
    } else {
      const applied = await dataSource.runMigrations({ transaction: 'none' });
      console.info(
        'Applied migrations:',
        applied.map((m) => m.name).join(', ') || 'none',
      );
    }
  } catch (e) {
    // QueryFailedError includes query parameters; never print it or seed hashes.
    console.error(
      e.message?.startsWith('Account migration:')
        ? e.message
        : 'Migration failed; check database connectivity, schema conflicts and preflight data. SQL parameters omitted.',
    );
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
main();
