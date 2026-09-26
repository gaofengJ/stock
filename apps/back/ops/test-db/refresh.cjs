/* Runs in the existing backend container; uses its mysql2 dependency. */
const crypto = require('crypto');
const TABLES = [
  't_source_trade_cal',
  't_source_stock',
  't_source_active_funds',
  't_source_daily',
  't_source_limit',
  't_processed_senti',
];
const DATED = TABLES.slice(3);
const KEYS = {
  t_source_daily: ['ts_code', 'trade_date'],
  t_source_limit: ['ts_code', 'trade_date', 'limit'],
  t_processed_senti: ['trade_date'],
};
const quote = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid identifier');
  return '`' + name + '`';
};
function validateConfig(settings) {
  if (
    settings.target !== 'stock_test' ||
    !settings.source ||
    settings.source === settings.target
  )
    throw new Error('Only stock_test may be written');
  quote(settings.source);
  if (
    !Number.isInteger(settings.days) ||
    settings.days < 2 ||
    settings.days > 60
  )
    throw new Error('Window must be 2..60 trading days');
}

async function refresh(settings, previous = {}, force = false) {
  validateConfig(settings);
  const mysql = require('mysql2/promise');
  const connection = {
    host: settings.host,
    port: settings.port || 3306,
    user: settings.user,
    password: settings.password,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 10000,
  };
  const source = await mysql.createConnection(connection);
  let target;
  let locked = false;
  const sourceTable = (name) => quote(settings.source) + '.' + quote(name);
  const targetTable = (name) => quote(settings.target) + '.' + quote(name);
  const lockName =
    'stock-sync:' +
    crypto
      .createHash('sha256')
      .update(settings.target)
      .digest('hex')
      .slice(0, 40);
  const query = (db, sql, values = []) =>
    db.query({ sql, timeout: 45000 }, values).then(([rows]) => rows);
  async function fingerprint() {
    const values = {
      source: settings.source,
      target: settings.target,
      days: settings.days,
    };
    for (const name of TABLES) {
      const fields = DATED.includes(name)
        ? 'MAX(id) id, MAX(trade_date) date'
        : 'MAX(id) id';
      values[name] = (
        await query(source, 'SELECT ' + fields + ' FROM ' + sourceTable(name))
      )[0];
    }
    const dates = DATED.map((name) => values[name].date);
    if (!dates[0] || dates[2] !== dates[0] || dates[1] > dates[0])
      throw new Error(
        'Production daily/sentiment dates are not aligned; retry later',
      );
    const stateTable = await query(
      source,
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [settings.source, 't_sync_run'],
    );
    let hasRunState = false;
    if (stateTable.length) {
      values.revision = (
        await query(
          source,
          'SELECT MAX(updated_at) updated, COUNT(*) count, COALESCE(SUM(attempts),0) attempts FROM ' +
            sourceTable('t_sync_run'),
        )
      )[0];
      const runs = await query(
        source,
        'SELECT status,updated_at FROM ' +
          sourceTable('t_sync_run') +
          ' WHERE task=? AND trade_date=?',
        ['daily', dates[0]],
      );
      if (runs.length && runs[0].status !== 'success')
        throw new Error('Latest production sync is not successful');
      if (runs.length) {
        values.run = runs[0];
        hasRunState = true;
      }
    }
    if (!hasRunState && dates[1] !== dates[0])
      throw new Error('Legacy limit date is not aligned');
    return { signature: JSON.stringify(values), latest: dates[0], hasRunState };
  }
  try {
    target = await mysql.createConnection(connection);
    const [lock] = await query(target, 'SELECT GET_LOCK(?,0) acquired', [
      lockName,
    ]);
    locked = Number(lock.acquired) === 1;
    if (!locked) return { status: 'busy' };
    const before = await fingerprint();
    if (!force && before.signature === previous.copiedFingerprint)
      return { status: 'unchanged' };
    // Old production versions have no run table: require the same completed-date
    // fingerprint on two timer checks, plus consistency checks before publishing.
    if (
      !before.hasRunState &&
      before.signature !== previous.observedFingerprint
    )
      return {
        status: 'waiting-for-stable-source',
        observedFingerprint: before.signature,
      };
    await query(source, 'SET TRANSACTION READ ONLY');
    await query(source, 'START TRANSACTION WITH CONSISTENT SNAPSHOT');
    const dates = await query(
      source,
      'SELECT cal_date, pre_trade_date FROM ' +
        sourceTable('t_source_trade_cal') +
        ' WHERE is_open=1 AND cal_date<=? ORDER BY cal_date DESC LIMIT ?',
      [before.latest, settings.days + 1],
    );
    if (dates.length < settings.days + 1)
      throw new Error('Insufficient trading calendar');
    const orderedDates = dates.map((row) => row.cal_date).reverse();
    const sourcePolicy = await query(
      source,
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [settings.source, 't_sync_day_policy'],
    );
    const excludedDates = new Set(
      sourcePolicy.length
        ? (
            await query(
              source,
              'SELECT trade_date FROM ' + sourceTable('t_sync_day_policy'),
            )
          ).map((row) => row.trade_date)
        : [],
    );
    const counts = {};
    const ready = {};
    for (const name of TABLES) {
      const stage = targetTable('_refresh_' + name);
      const current = targetTable(name);
      await query(target, 'DROP TABLE IF EXISTS ' + stage);
      await query(target, 'CREATE TABLE ' + stage + ' LIKE ' + current);
      const sourceColumns = await query(
        source,
        'SHOW COLUMNS FROM ' + sourceTable(name),
      );
      const targetColumns = await query(target, 'SHOW COLUMNS FROM ' + current);
      const columns = sourceColumns.map((column) => column.Field);
      if (
        JSON.stringify(columns) !==
        JSON.stringify(targetColumns.map((column) => column.Field))
      )
        throw new Error(
          'Schema differs for ' +
            name +
            '; migrate explicitly before refreshing',
        );
      const columnList = columns.map(quote).join(',');
      const keys = new Set();
      ready[name] = {};
      for (const date of DATED.includes(name) ? orderedDates : [null]) {
        let lastId = 0;
        while (true) {
          const rows = await query(
            source,
            'SELECT ' +
              columnList +
              ' FROM ' +
              sourceTable(name) +
              ' WHERE ' +
              (date ? 'trade_date=? AND ' : '') +
              'id>? ORDER BY id LIMIT 1000',
            date ? [date, lastId] : [lastId],
          );
          if (!rows.length) break;
          for (const row of rows) {
            const key = (KEYS[name] || ['id'])
              .map((field) => row[field])
              .join('|');
            keys.add(key);
            if (date) ready[name][date] = true;
          }
          // Ascending IDs make the newest source row win on business-key duplicates.
          await query(
            target,
            'INSERT INTO ' +
              stage +
              ' (' +
              columnList +
              ') VALUES ? ON DUPLICATE KEY UPDATE ' +
              columns
                .map(
                  (column) => quote(column) + '=VALUES(' + quote(column) + ')',
                )
                .join(','),
            [rows.map((row) => columns.map((column) => row[column]))],
          );
          lastId = rows[rows.length - 1].id;
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }
      const [count] = await query(
        target,
        'SELECT COUNT(*) count FROM ' + stage,
      );
      counts[name] = Number(count.count);
      if (counts[name] !== keys.size)
        throw new Error('Snapshot row count mismatch: ' + name);
      if (
        !counts[name] &&
        !['t_source_active_funds', 't_source_limit'].includes(name)
      )
        throw new Error('Empty source table: ' + name);
    }
    for (const date of orderedDates) {
      if (excludedDates.has(date)) continue;
      const predecessor = dates.find(
        (row) => row.cal_date === date,
      ).pre_trade_date;
      if (
        !ready.t_source_daily[date] ||
        (!ready.t_processed_senti[date] && !excludedDates.has(predecessor))
      )
        throw new Error('Incomplete production date: ' + date);
    }
    await query(source, 'COMMIT');
    const after = await fingerprint();
    if (after.signature !== before.signature)
      throw new Error(
        'Production changed during copy; old test snapshot retained',
      );
    // One atomic rename publishes all six tables together. Test users/roles and
    // migration history are deliberately excluded from the refresh.
    for (const name of TABLES)
      await query(
        target,
        'DROP TABLE IF EXISTS ' + targetTable('_previous_' + name),
      );
    const renames = TABLES.flatMap((name) => [
      targetTable(name) + ' TO ' + targetTable('_previous_' + name),
      targetTable('_refresh_' + name) + ' TO ' + targetTable(name),
    ]);
    await query(target, 'SET SESSION lock_wait_timeout=10');
    await query(target, 'RENAME TABLE ' + renames.join(', '));
    // These records described the replaced test snapshot, not production.
    await query(target, 'DELETE FROM ' + targetTable('t_sync_run'));
    const policyTable = await query(
      target,
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?',
      [settings.target, 't_sync_day_policy'],
    );
    if (policyTable.length)
      await query(target, 'DELETE FROM ' + targetTable('t_sync_day_policy'));
    for (const name of TABLES)
      await query(target, 'DROP TABLE ' + targetTable('_previous_' + name));
    return {
      status: 'copied',
      readiness: before.hasRunState ? 'sync-success' : 'legacy-stable',
      copiedFingerprint: before.signature,
      observedFingerprint: before.signature,
      window: {
        start: orderedDates[0],
        end: before.latest,
        tradingDays: orderedDates.length,
      },
      counts,
    };
  } finally {
    await source.end();
    if (target) {
      try {
        if (locked) await query(target, 'SELECT RELEASE_LOCK(?)', [lockName]);
      } finally {
        await target.end();
      }
    }
  }
}

module.exports = { validateConfig, refresh, TABLES };
if (typeof config !== 'undefined') {
  refresh(config, state, force)
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.log(
        JSON.stringify({
          status: 'failed',
          error: error.code || error.message,
        }),
      );
      process.exitCode = 1;
    });
}
